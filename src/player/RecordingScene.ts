import { Scene } from '../core/Scene';
import { Mobject } from '../core/Mobject';
import { Animation } from '../animation/Animation';
import { AnimationGroup } from '../animation/AnimationGroup';
import { MasterTimeline, type Segment, type SlideOptions } from '../animation/MasterTimeline';
import { prepareMobjects } from '../core/readiness';
import { captureScene, restoreScene, type SceneCheckpoint } from './SceneCheckpoint';
import type { MobjectState } from '../core/StateManager';

interface CompiledSegment {
  segment: Segment;
  start: SceneCheckpoint;
  end: SceneCheckpoint;
}

/**
 * Sequential construction context. Awaited play/wait evaluates on a fixed clock,
 * so subsequent author calculations observe the final state. Compilation retains
 * immutable checkpoints for arbitrary seeking. Playback advances a fixed 60 Hz
 * clock, displaying the preceding tick (less than 1/60 s behind timeline time).
 * Explicit seeks also evaluate the fractional tail to display the exact time.
 * Updaters must keep mutable state in mobjects (captureState for custom classes).
 */
export class RecordingScene {
  private readonly _known = new Set<Mobject>();
  private readonly _compiled: CompiledSegment[] = [];
  private readonly _stepIds = new Set<string>();
  private readonly _initial: SceneCheckpoint;
  private readonly _snapshotCache = new WeakMap<Mobject, MobjectState>();
  private _activeSegment: Segment | undefined;
  private _activeElapsed: number | undefined;

  constructor(
    private _realScene: Scene,
    private _masterTimeline: MasterTimeline,
  ) {
    this._initial = this._capture();
  }

  private _capture(): SceneCheckpoint {
    return captureScene(this._realScene, this._known, this._snapshotCache);
  }

  async play(...animations: Animation[]): Promise<void> {
    if (animations.length === 0) return;
    for (const animation of this._collectAll(animations)) {
      // Include targets before begin/cleanup can swap them into the scene.
      for (const value of Object.values(animation)) {
        if (value instanceof Mobject) this._known.add(value);
      }
      this._known.add(animation.mobject);
    }
    await prepareMobjects([...this._realScene.mobjects, ...this._known]);
    const start = this._capture();
    const segment = this._masterTimeline.addSegment(animations);
    Animation.withExternalState(this._collectAll(animations), () => {
      this._begin(animations);
      this._advance(segment, segment.endTime - segment.startTime);
    });
    await prepareMobjects(this._realScene.mobjects);
    this._compiled.push({ segment, start, end: this._capture() });
  }

  async wait(duration = 1): Promise<void> {
    if (!Number.isFinite(duration) || duration < 0)
      throw new Error('Wait duration must be finite and nonnegative.');
    await prepareMobjects(this._realScene.mobjects);
    const start = this._capture();
    const segment = this._masterTimeline.addWaitSegment(duration);
    this._advance(segment, duration);
    this._compiled.push({ segment, start, end: this._capture() });
  }

  async nextSlide(options: SlideOptions = {}): Promise<void> {
    this._masterTimeline.beginSlide(options);
  }

  /** A named animation interval defines navigation, notes and printing together. */
  async step(
    options: SlideOptions & { id: string },
    build: () => Promise<unknown> | void,
  ): Promise<void> {
    if (this._stepIds.has(options.id)) throw new Error(`Duplicate checkpoint ID: ${options.id}`);
    this._stepIds.add(options.id);
    this._masterTimeline.beginSlide(options);
    const before = this._masterTimeline.segmentCount;
    await build();
    // Static authored states also need an explicit, addressable checkpoint.
    if (this._masterTimeline.segmentCount === before) await this.wait(0);
    const last = this._compiled[this._compiled.length - 1];
    if (last) last.end = this._capture();
  }

  add(...mobjects: Mobject[]): Scene {
    mobjects.forEach((object) => this._known.add(object));
    return this._realScene.add(...mobjects);
  }

  remove(...mobjects: Mobject[]): Scene {
    mobjects.forEach((object) => this._known.add(object));
    return this._realScene.remove(...mobjects);
  }

  get camera() {
    return this._realScene.camera;
  }
  get scene(): Scene {
    return this._realScene;
  }
  batch(callback: () => void): void {
    this._realScene.batch(callback);
  }

  /** Complete compilation and return the live scene to its first authored state. */
  async finish(): Promise<void> {
    await prepareMobjects(this._realScene.mobjects);
    const finalState = this._capture();
    this._masterTimeline.finalizeSlides();
    this._masterTimeline.setEvaluator((time, segmentIndex, position, mode) => {
      const compiled =
        segmentIndex === undefined
          ? this._compiled.find(({ segment }) => time <= segment.endTime)
          : this._compiled[segmentIndex];
      if (!compiled) {
        this._resetActiveSegment();
        restoreScene(this._realScene, finalState, false);
        return;
      }
      const { segment, start, end } = compiled;
      if (position !== 'start' && time >= segment.endTime) {
        this._resetActiveSegment();
        restoreScene(this._realScene, end, false);
        return;
      }
      const requested = Math.max(0, time - segment.startTime);
      const wholeTick = Math.floor(requested * 60 + 1e-9) / 60;
      const elapsed = mode === 'playback' ? wholeTick : requested;
      const canContinue =
        position === undefined &&
        this._activeSegment === segment &&
        this._activeElapsed !== undefined &&
        (mode === 'playback' ? elapsed >= this._activeElapsed : elapsed > this._activeElapsed);
      Animation.withExternalState(this._collectAll(segment.animations), () => {
        let previous = this._activeElapsed;
        if (!canContinue) {
          const previousActive = this._resetActiveSegment();
          if (previousActive !== segment) {
            for (const animation of segment.animations) animation.reset();
          }
          restoreScene(this._realScene, start, false);
          this._activeSegment = segment;
          this._begin(segment.animations);
          previous = undefined;
        }
        this._advance(segment, elapsed, previous);
        // A fractional seek must never become an extra integration step in
        // subsequent fixed-clock playback. Rebuild once when it resumes.
        this._activeElapsed = Math.abs(elapsed - wholeTick) <= 1e-9 ? wholeTick : undefined;
      });
    });
  }

  rollback(): void {
    this._resetActiveSegment();
    restoreScene(this._realScene, this._initial);
  }

  /** Release transient animation-owned visuals before restoring another state. */
  private _resetActiveSegment(): Segment | undefined {
    const segment = this._activeSegment;
    this._activeSegment = undefined;
    this._activeElapsed = undefined;
    if (segment) {
      Animation.withExternalState(this._collectAll(segment.animations), () => {
        for (const animation of segment.animations) animation.reset();
      });
    }
    return segment;
  }

  /** Release recorded objects that are no longer owned by the live scene. */
  disposeDetached(): void {
    const retained = new Set(this._initial.objects.map(({ object }) => object));
    const candidates = new Set<Mobject>(this._known);
    for (const compiled of this._compiled) {
      compiled.start.objects.forEach(({ object }) => candidates.add(object));
      compiled.end.objects.forEach(({ object }) => candidates.add(object));
    }
    for (const object of candidates) {
      if (!retained.has(object) && !object.parent && !this._realScene.mobjects.has(object))
        object.dispose();
    }
  }

  private _begin(animations: Animation[]): void {
    for (const animation of animations) {
      animation.startTime = 0;
      animation.begin();
    }
    for (const animation of this._collectAll(animations)) {
      if (animation instanceof AnimationGroup || animation.mobject === this.camera.frame) continue;
      if (!this._realScene.mobjects.has(animation.mobject) && !animation.mobject.parent)
        this._realScene.add(animation.mobject);
    }
  }

  /**
   * @pre elapsed >= 0
   * @pre previous === undefined || (previous <= elapsed && Math.abs(previous * 60 - Math.round(previous * 60)) < 1e-7)
   */
  private _advance(segment: Segment, elapsed: number, previous?: number): void {
    const duration = segment.endTime - segment.startTime;
    let lastTime = previous ?? 0;
    const tick = (time: number) => {
      for (const animation of segment.animations) animation.update(time - lastTime, time);
      for (const object of this._realScene.mobjects) object.update(time - lastTime);
      this.camera.updateFrame(time - lastTime);
      lastTime = time;
    };
    if (previous === undefined) tick(0);
    const ticks = Math.floor(elapsed * 60 + 1e-9);
    for (let i = Math.floor(lastTime * 60 + 1e-9) + 1; i <= ticks; i++) tick(i / 60);
    if (elapsed - lastTime > 1e-9) tick(elapsed);
    if (elapsed >= duration) {
      for (const animation of this._collectAll(segment.animations))
        animation.cleanUpFromScene(this._realScene);
    }
  }

  private _collectAll(animations: Animation[]): Animation[] {
    return animations.flatMap((animation) =>
      animation instanceof AnimationGroup
        ? [animation, ...this._collectAll(animation.animations)]
        : [animation],
    );
  }
}
