import type { Player } from '../player/Player';
import { appendSemanticText } from '../presentation/semantic';
import { preloadTextFonts } from '../mobjects/text/TextFont';
import { logger } from '../utils/logger';
import { presentation } from './authoring';
import {
  createScenePlayer,
  loadPresentationAssets,
  loadScene,
  presentationSize,
  sceneKey,
} from './compile';
import { prepareImages } from './content';
import { buildPresentationDocument, presentationStyles } from './document';
import { PrintLifecycle } from './lifecycle';
import type {
  PresentationAssets,
  PresentationDefinition,
  PresentationPluginOptions,
  PresentationRoute,
  RevealDeck,
  RevealEvent,
} from './types';

interface LiveScene {
  key: string;
  player: Player;
  host: HTMLElement;
  selection: HTMLElement;
  unsubscribe: Array<() => void>;
}

declare global {
  interface Window {
    /** Build/PDF tools use this public plugin instance after readiness. */
    __MANIM_PRESENTATION__?: ManimPresentation;
  }
}

/** Optional Reveal integration with native horizontal topics and vertical checkpoint leaves. */
export class ManimPresentation {
  readonly id = 'manim-web';
  ready = false;
  error: string | undefined;
  private _deck?: RevealDeck;
  private _assets?: PresentationAssets;
  private _routes: PresentationRoute[] = [];
  private _route?: PresentationRoute;
  private _live?: LiveScene;
  private _handout?: HTMLElement;
  private _style?: HTMLStyleElement;
  private _loading?: HTMLElement;
  private _controls?: HTMLElement;
  private _printing?: PrintLifecycle;
  private _generation = 0;
  private _disposed = false;
  private _overview = false;
  private _restoreNext = false;
  private _resumeVisibility = false;
  private _initialHash = false;
  private _staticView = false;
  private _listeners: Array<[string, (event: RevealEvent) => void]> = [];
  private _preparation: Promise<void> = Promise.resolve();

  constructor(
    private readonly _definition: PresentationDefinition,
    private readonly _options: PresentationPluginOptions = {},
  ) {
    presentation(_definition);
  }

  get routes(): readonly PresentationRoute[] {
    return this._routes;
  }
  get player(): Player | undefined {
    return this._live?.player;
  }

  /**
   * Keep Reveal's JSON configuration messages independent of live runtime state.
   * @post Object.keys(result).length === 1 && result.id === this.id
   * @note Speaker view serializes getConfig(), including its plugin instances.
   */
  toJSON(): { id: string } {
    return { id: this.id };
  }

  /** Reveal waits for this promise before announcing its own ready event. */
  async init(deck: RevealDeck): Promise<void> {
    this._deck = deck;
    this._initialHash = location.hash.length > 1;
    const query = new URLSearchParams(location.search);
    this._staticView =
      query.has('manim-print') || query.has('print-pdf') || query.has('manim-capture');
    window.__MANIM_PRESENTATION__ = this;
    this._style = presentationStyles(this._definition);
    document.head.append(this._style);
    this._loading = document.createElement('div');
    this._loading.className = 'manim-loading';
    this._loading.setAttribute('role', 'status');
    this._loading.textContent = 'Preparing presentation…';
    document.body.append(this._loading);
    try {
      this._assets = await loadPresentationAssets(this._options.assets, this._definition);
      await preloadTextFonts(
        Object.values(this._assets.scenes).flatMap((scene) =>
          Object.values(scene.snapshots).flatMap((snapshot) => snapshot.text),
        ),
      );
      if (this._disposed) return;
      const { routes, handout } = buildPresentationDocument(
        this._definition,
        this._assets,
        deck.getSlidesElement(),
      );
      this._routes = routes;
      this._handout = handout;
      document.body.append(handout);
      await Promise.all([prepareImages(handout), this._prepareBackgrounds()]);
      if (this._disposed) return;
      deck.configure({
        ...presentationSize(this._definition),
        margin: 0,
        center: false,
        navigationMode: 'default',
      });
      // During plugin initialization Reveal has not bound its controls yet;
      // its normal startup sync will discover the newly authored sections.
      if (deck.isReady()) deck.sync();
      this._bind('ready', () => this._navigate(false));
      this._bind('slidechanged', () => this._navigate());
      this._bind('overviewshown', this._overviewShown);
      this._bind('overviewhidden', this._overviewHidden);
      this._bind('paused', () => this.pause());
      deck.addKeyBinding(
        { keyCode: 80, key: 'P', description: 'Pause or resume the active animation' },
        () => this.togglePlayback(),
      );
      deck.addKeyBinding(
        { keyCode: 82, key: 'R', description: 'Replay the active animation checkpoint' },
        () => this.replay(),
      );
      document.addEventListener('visibilitychange', this._visibilityChanged);
      window.addEventListener('hashchange', this._hashChanged, true);
      this._printing = new PrintLifecycle(() => this.player, deck.getRevealElement());
      this._addControls();
      if (query.has('manim-print') || query.has('print-pdf')) {
        handout.dataset.view = 'screen';
        deck.getRevealElement().hidden = true;
      }
      this.ready = true;
      this._loading.remove();
      if (deck.isReady()) this._navigate(false);
    } catch (error) {
      this._reportError(error);
      throw error;
    }
  }

  private async _prepareBackgrounds(): Promise<void> {
    const sources = new Set(
      this._definition.topics.flatMap((topic) =>
        topic.slides.map((slide) => slide.backgroundImage),
      ),
    );
    await Promise.all(
      Array.from(sources, async (source) => {
        if (!source) return;
        const image = new Image();
        image.src = source;
        try {
          await image.decode();
        } catch {
          throw new Error(`Presentation background failed to decode: ${source}`);
        }
      }),
    );
  }

  private _addControls(): void {
    if (this._options.controls === false) return;
    this._controls = document.createElement('nav');
    this._controls.className = 'manim-controls';
    this._controls.setAttribute('aria-label', 'Presentation controls');
    const actions: Array<[string, () => void]> = [
      ['Play / pause', () => this.togglePlayback()],
      ['Replay', () => this.replay()],
      ['Print', () => this.print()],
    ];
    for (const [label, action] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      this._controls.append(button);
    }
    document.body.append(this._controls);
  }

  private _bind(event: string, listener: (event: RevealEvent) => void): void {
    this._deck!.on(event, listener);
    this._listeners.push([event, listener]);
  }

  private _navigate(allowAnimation = true): void {
    if (this._staticView) return;
    const indices = this._deck!.getIndices();
    const route = this._routes.find(
      (candidate) => candidate.h === indices.h && candidate.v === (indices.v ?? 0),
    );
    if (!route || route === this._route) return;
    const previous = this._route;
    const play = this._shouldPlay(route, previous, allowAnimation);
    this._restoreNext = false;
    this._route = route;
    // Invalidate pending preparation before starting another navigation. Late
    // promises always dispose their player and cannot replace the current leaf.
    const generation = ++this._generation;
    this._routes.forEach((candidate) => {
      delete candidate.element.dataset.preparing;
    });
    // Hide the completed preview before yielding to asynchronous scene loading.
    // Backward navigation and direct links still display the settled checkpoint.
    if (play && route.slide.kind === 'scene') route.element.dataset.preparing = 'true';
    this.player?.stop();
    previous?.element
      .querySelectorAll<HTMLMediaElement>('audio, video')
      .forEach((media) => media.pause());
    void this._activate(route, generation, play)
      .catch((error: unknown) => {
        if (generation === this._generation && !this._disposed) this._reportError(error);
      })
      .finally(() => {
        if (generation === this._generation) delete route.element.dataset.preparing;
      });
  }

  private _shouldPlay(
    route: PresentationRoute,
    previous: PresentationRoute | undefined,
    allowAnimation: boolean,
  ): boolean {
    if (!previous)
      return !this._initialHash && route.ordinal === 0 && route.checkpoint?.autoNext === true;
    return (
      allowAnimation && !this._restoreNext && !this._overview && route.ordinal > previous.ordinal
    );
  }

  private async _activate(
    route: PresentationRoute,
    generation: number,
    play: boolean,
  ): Promise<void> {
    if (route.slide.kind !== 'scene' || !route.checkpoint) {
      this._disposeLive();
      return;
    }
    const key = sceneKey(route.topic.id, route.slide.id);
    if (this._live?.key !== key) {
      this._disposeLive();
      const slide = route.slide;
      const definition = await loadScene(slide);
      if (generation !== this._generation || this._disposed) return;
      const preparation = this._preparation.then(async () => {
        if (generation !== this._generation || this._disposed) return;
        const host = document.createElement('div');
        host.className = 'manim-live';
        const player = createScenePlayer(host, definition, this._definition, slide);
        try {
          await player.sequence(definition.build);
          await player.prepare();
          if (generation !== this._generation || this._disposed) {
            player.dispose();
            return;
          }
        } catch (error) {
          player.dispose();
          throw error;
        }
        const selection = document.createElement('div');
        selection.className = 'manim-selection';
        host.append(selection);
        const updateText = (): void => {
          selection.replaceChildren();
          if (!player.isPlaying)
            appendSemanticText(selection, player.inspectText(), { selectableOnly: true });
        };
        const unsubscribe = ['frame', 'play', 'pause', 'complete'].map((event) =>
          player.on(event as 'frame' | 'play' | 'pause' | 'complete', updateText),
        );
        unsubscribe.push(
          player.on('complete', () => {
            const checkpoint = this._route?.checkpoint;
            if (checkpoint?.autoNext && !checkpoint.loop && this._live?.player === player)
              this._deck!.next();
          }),
        );
        unsubscribe.push(player.on('error', (_player, error) => this._reportError(error)));
        this._live = { key, player, host, selection, unsubscribe };
      });
      // Only one scene may own a preparation context at a time. Superseded
      // entries still finish/dispose, and stale queued entries allocate nothing.
      this._preparation = preparation.then(
        () => undefined,
        () => undefined,
      );
      await preparation;
    }
    if (generation !== this._generation || this._disposed || !this._live) return;
    this._routes.forEach((candidate) => {
      delete candidate.element.dataset.live;
    });
    route.element.append(this._live.host);
    route.element.dataset.live = 'true';
    if (play) this._live.player.playCheckpoint(route.checkpoint.id);
    else this._live.player.seekCheckpoint(route.checkpoint.id, 'end');
  }

  private _disposeLive(): void {
    if (!this._live) return;
    this._live.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this._live.host.parentElement?.removeAttribute('data-live');
    this._live.player.dispose();
    this._live.host.remove();
    this._live = undefined;
  }

  private _overviewShown = (): void => {
    this._overview = true;
    this._restoreNext = true;
    this.pause();
  };

  private _overviewHidden = (): void => {
    this._overview = false;
    this._navigate(false);
    this._restoreNext = false;
  };

  private _visibilityChanged = (): void => {
    if (document.hidden) {
      this._resumeVisibility = this.player?.isPlaying ?? false;
      this.pause();
    } else if (this._options.resumeAfterVisibility && this._resumeVisibility) {
      this.player?.play();
      this._resumeVisibility = false;
    }
  };

  private _hashChanged = (): void => {
    // Reveal writes its own hash after updating the active route. A hash that
    // names a different route is an explicit jump and restores a settled state.
    const hash = location.hash.replace(/^#\/?/, '');
    const target = this._routes.find(
      (route) =>
        hash === route.element.id ||
        hash === `${route.h}/${route.v}` ||
        (route.v === 0 && hash === `${route.h}`),
    );
    if (target && target !== this._route) this._restoreNext = true;
  };

  pause(): void {
    this.player?.pause();
    this._deck
      ?.getCurrentSlide()
      ?.querySelectorAll<HTMLMediaElement>('audio, video')
      .forEach((media) => media.pause());
  }

  togglePlayback(): void {
    if (this.player?.isPlaying) this.pause();
    else if (
      this.player &&
      this._route?.checkpoint &&
      this.player.timeline.getCurrentTime() >= this._route.checkpoint.endTime
    )
      this.replay();
    else this.player?.play();
  }

  replay(): void {
    if (this._route?.checkpoint) this.player?.playCheckpoint(this._route.checkpoint.id);
  }

  /** All native and button-triggered print routes use the same prepared handout. */
  print(): void {
    if (!this.ready) throw new Error('The presentation is not ready to print.');
    window.print();
  }

  exportAssets(): PresentationAssets {
    if (!this.ready || !this._assets) throw new Error('Presentation assets are not ready.');
    return structuredClone(this._assets);
  }

  private _reportError(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    if (this._loading?.isConnected) this._loading.textContent = this.error;
    if (this._options.onError) this._options.onError(error);
    else logger.error('Presentation failed.', error);
  }

  /** Reveal invokes destroy when the owning deck is destroyed. */
  destroy(): void {
    this._disposed = true;
    this._generation++;
    this.ready = false;
    this._disposeLive();
    this._listeners.forEach(([event, listener]) => this._deck?.off(event, listener));
    this._listeners = [];
    this._deck?.removeKeyBinding(80);
    this._deck?.removeKeyBinding(82);
    document.removeEventListener('visibilitychange', this._visibilityChanged);
    window.removeEventListener('hashchange', this._hashChanged, true);
    this._printing?.dispose();
    this._handout?.remove();
    this._style?.remove();
    this._loading?.remove();
    this._controls?.remove();
    if (window.__MANIM_PRESENTATION__ === this) delete window.__MANIM_PRESENTATION__;
  }
}

/** Create one plugin instance per Reveal deck. */
export function manimPresentation(
  definition: PresentationDefinition,
  options: PresentationPluginOptions = {},
): ManimPresentation {
  return new ManimPresentation(definition, options);
}
