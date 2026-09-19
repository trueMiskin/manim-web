import { Mobject } from '../core/Mobject';
import { RichParagraph } from '../mobjects/text/RichParagraph';
import { Animation, type AnimationOptions } from '../animation/Animation';
import { AnimationGroup } from '../animation/AnimationGroup';
import { FadeIn } from '../animation/fading/FadeIn';
import { FadeOut } from '../animation/fading/FadeOut';
import { Write } from '../animation/creation/Create';
import type { SlideOptions } from '../animation/MasterTimeline';
import type { RecordingScene } from '../player/RecordingScene';
import type { SceneDefinition } from './types';
import { SlideBullets, SlideRegion } from './slideBlocks';
import { SlideLayout } from './slideLayout';
import { resolveSlideTheme, type SlideTheme, type SlideThemeOptions } from './slideTheme';
import { SlideVisibility } from './slideVisibility';

export interface ContentSlideOptions {
  title: string;
  /** Defaults to true. False reserves the title's space for an authored entrance. */
  titleVisible?: boolean;
  theme?: SlideThemeOptions;
  options?: SceneDefinition['options'];
  createScene?: SceneDefinition['createScene'];
}

export type SlideTarget = Mobject | SlideBullets;

/** Content authoring over the same recorder used by hand-authored scene definitions. */
export class SlideContext extends SlideRegion {
  private prepared?: Promise<void>;
  private stepCount = 0;
  private registered = false;
  private readonly visibility = new SlideVisibility();

  constructor(
    readonly scene: RecordingScene,
    theme: SlideTheme,
    readonly title: RichParagraph,
    private readonly titleVisible = true,
  ) {
    const layout = new SlideLayout(scene.camera.frameWidth, scene.camera.frameHeight, theme, title);
    super(layout, layout.root);
  }

  private prepare(): Promise<void> {
    return (this.prepared ??= this.prepareContent());
  }

  private async prepareContent(): Promise<void> {
    await this.layout.prepare();
    this.visibility.hide(this.title);
    if (this.titleVisible) this.visibility.reveal(this.title, true);
    this.scene.add(this.title);
    for (const object of this.layout.objects) {
      this.visibility.hide(object);
      this.scene.add(object);
    }
    this.registered = true;
  }

  /** Release content that failed preparation before the recorder took ownership. */
  disposeUnregistered(): void {
    if (this.registered) return;
    for (const object of [this.title, ...this.layout.objects]) {
      if (!object.parent && !this.scene.scene.mobjects.has(object)) object.dispose();
    }
  }

  /** Each step is one addressable navigation pause and printable state. */
  async step(
    options: SlideOptions & { id: string },
    build: () => Promise<unknown> | void,
  ): Promise<void> {
    await this.prepare();
    await this.scene.step(options, build);
    this.stepCount++;
  }

  /** Run ordinary Manim animations, revealing any declared source blocks they target. */
  async play(...animations: Animation[]): Promise<void> {
    await this.prepare();
    for (const animation of animations) this.revealSources(animation);
    await this.scene.play(...animations);
  }

  private revealSources(animation: Animation): void {
    if (animation instanceof AnimationGroup) {
      animation.animations.forEach((child) => this.revealSources(child));
      return;
    }
    this.visibility.animate(animation.mobject);
    if (
      'target' in animation &&
      animation.target instanceof Mobject &&
      this.layout.objects.has(animation.target) &&
      !animation.target.getThreeObject().visible
    ) {
      // A declared destination has reserved layout space but should enter the
      // scene only when the transform swaps it in. Copies need its visible ink.
      this.scene.remove(animation.target);
      this.visibility.reveal(animation.target, true);
    }
  }

  private showObject(object: Mobject): void {
    let root = object;
    while (root.parent) root = root.parent;
    // Removal hides the whole tree regardless of its retained authored opacity.
    // Returning one child must not expose the detached root's other descendants.
    if (!this.scene.scene.mobjects.has(root)) this.visibility.hideDetached(root);
    this.visibility.reveal(object, true);
    if (!this.scene.scene.mobjects.has(root)) this.scene.add(root);
  }

  /** Fade in one or more blocks simultaneously using the theme's default duration. */
  async reveal(...targets: SlideTarget[]): Promise<void> {
    await this.prepare();
    const objects = targets.flatMap((target) =>
      target instanceof SlideBullets ? [...target.items] : [target],
    );
    objects.forEach((object) => this.showObject(object));
    await this.play(
      ...objects.map((object) => new FadeIn(object, { duration: this.theme.duration })),
    );
  }

  /** Show content immediately inside a static step, without an entrance animation. */
  async show(...targets: SlideTarget[]): Promise<void> {
    await this.prepare();
    for (const target of targets) {
      const objects = target instanceof SlideBullets ? target.items : [target];
      objects.forEach((object) => this.showObject(object));
    }
  }

  /**
   * Crossfade two already positioned objects without changing layout.
   * Use a slot to give alternatives the same reserved area.
   * @pre previous !== next
   */
  async replace(
    previous: Mobject,
    next: Mobject,
    options: Pick<AnimationOptions, 'duration' | 'rateFunc'> = {},
  ): Promise<void> {
    if (previous === next) throw new Error('A replacement needs two different objects.');
    await this.prepare();
    this.showObject(next);
    const timing = {
      duration: options.duration ?? this.theme.duration,
      rateFunc: options.rateFunc,
    };
    await this.play(new FadeOut(previous, timing), new FadeIn(next, timing));
  }

  /** Use the ordinary Write treatment, with optional animation timing overrides. */
  async write(object: Mobject, options: AnimationOptions = {}): Promise<void> {
    await this.prepare();
    this.showObject(object);
    await this.play(new Write(object, { duration: this.theme.duration, ...options }));
  }

  /** Add a static title checkpoint when a slide has no explicitly authored steps. */
  async finish(): Promise<void> {
    if (this.stepCount === 0) await this.step({ id: 'content' }, () => {});
  }
}

/**
 * Author a slide with automatic layout and explicit animation checkpoints.
 * Declare all layout blocks before the first step; hidden blocks reserve their space.
 * @post typeof result.build === 'function'
 */
export function defineSlide(
  options: ContentSlideOptions,
  build: (slide: SlideContext) => Promise<void>,
): SceneDefinition {
  const theme = resolveSlideTheme(options.theme);
  if (!options.title.trim()) throw new Error('A content slide needs a title.');
  return {
    options: { backgroundColor: theme.colors.background, ...options.options },
    createScene: options.createScene,
    async build(scene) {
      const title = new RichParagraph({
        text: options.title,
        width: scene.camera.frameWidth - 2 * theme.margin,
        fontFamily: theme.titleFontFamily ?? theme.fontFamily,
        fontUrl:
          theme.titleFontUrl ?? (theme.titleFontFamily === undefined ? theme.fontUrl : undefined),
        fontSize: theme.titleSize,
        fontWeight: 'bold',
        color: theme.colors.text,
        lineHeight: theme.lineHeight,
      });
      const context = new SlideContext(scene, theme, title, options.titleVisible);
      try {
        await build(context);
        await context.finish();
      } catch (error) {
        context.disposeUnregistered();
        throw error;
      }
    },
  };
}
