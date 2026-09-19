// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { manimPresentation } from './ManimPresentation';
import * as compilation from './compile';
import { blankSlide, markdownSlide, presentation, sceneSlides, topic } from './authoring';
import type { PresentationAssets, RevealDeck, RevealEvent, SceneDefinition } from './types';
import type { Slide } from '../animation/MasterTimeline';
import { darkColors, definePalettes, lightColors } from './palettes';

const { players, FakePlayer } = vi.hoisted(() => {
  const players: FakePlayer[] = [];
  class FakePlayer {
    disposed = false;
    isPlaying = false;
    time = 0;
    events = new Map<string, Set<() => void>>();
    calls: string[] = [];
    timeline = { getCurrentTime: () => this.time };
    constructor() {
      players.push(this);
    }
    async sequence(builder: () => Promise<void>) {
      await builder();
    }
    async prepare() {}
    inspectText() {
      return [];
    }
    seekCheckpoint(id: string, position: string) {
      this.calls.push(`seek:${id}:${position}`);
    }
    playCheckpoint(id: string) {
      this.calls.push(`play:${id}`);
      this.isPlaying = true;
    }
    pause() {
      this.calls.push('pause');
      this.isPlaying = false;
    }
    stop() {
      this.calls.push('stop');
      this.isPlaying = false;
    }
    play() {
      this.calls.push('resume');
      this.isPlaying = true;
    }
    on(event: string, listener: () => void) {
      const listeners = this.events.get(event) ?? new Set();
      listeners.add(listener);
      this.events.set(event, listeners);
      return () => {
        listeners.delete(listener);
      };
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { players, FakePlayer };
});

vi.mock('../player/Player', () => ({ Player: FakePlayer }));
vi.mock('../presentation/semantic', () => ({ appendSemanticText: vi.fn() }));

function checkpoint(id: string, index: number): Slide {
  return {
    id,
    title: id,
    notes: `Notes for ${id}`,
    index,
    startTime: index,
    endTime: index + 1,
    startSegmentIndex: index,
    endSegmentIndex: index,
    playbackRate: 1,
    loop: false,
    autoNext: false,
  };
}

function assets(): PresentationAssets {
  const result: PresentationAssets = {
    version: 1,
    title: 'Test presentation',
    width: 1280,
    height: 720,
    scenes: {},
  };
  for (const key of ['first/shapes', 'second/shapes']) {
    const checkpoints = [checkpoint('one', 0), checkpoint('two', 1)];
    result.scenes[key] = {
      checkpoints,
      snapshots: Object.fromEntries(
        checkpoints.map((item) => [
          item.id,
          {
            image: 'data:image/png;base64,aA==',
            text: [],
            width: 1280,
            height: 720,
            checkpoint: item,
          },
        ]),
      ),
    };
  }
  return result;
}

function createDeck() {
  const root = document.createElement('div');
  root.className = 'reveal';
  const slides = document.createElement('div');
  slides.className = 'slides';
  root.append(slides);
  document.body.append(root);
  const listeners = new Map<string, Set<(event: RevealEvent) => void>>();
  let indices = { h: 0, v: 0 };
  const deck: RevealDeck = {
    getRevealElement: () => root,
    getSlidesElement: () => slides,
    getIndices: () => indices,
    getCurrentSlide: () => slides.children[indices.h]?.children[indices.v] as HTMLElement,
    isReady: () => true,
    isOverview: () => false,
    configure: vi.fn(),
    sync: vi.fn(),
    next: vi.fn(),
    addKeyBinding: vi.fn(),
    removeKeyBinding: vi.fn(),
    on(event, listener) {
      const existing = listeners.get(event) ?? new Set();
      existing.add(listener);
      listeners.set(event, existing);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };
  return {
    deck,
    root,
    slides,
    emit(event: string) {
      listeners.get(event)?.forEach((listener) => listener({}));
    },
    navigate(h: number, v: number) {
      indices = { h, v };
      listeners.get('slidechanged')?.forEach((listener) => listener({ indexh: h, indexv: v }));
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  players.length = 0;
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue();
});

afterEach(() => {
  window.__MANIM_PRESENTATION__?.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Reveal presentation integration', () => {
  // MIGRATION: changing a deck's palette preserves checkpoint identity and
  // updates live content, previews and printing together; failed rebuilds and
  // changes to another presentation cannot change the committed palette.
  it('switches scoped palettes and retains the previous content if rebuilding fails', async () => {
    const palettes = definePalettes({
      dark: { ...darkColors, ray: '#00ffff' },
      light: { ...lightColors, ray: '#003b8e' },
    });
    const seenColors: string[] = [];
    const scene: SceneDefinition = {
      async build(_scene, { colors } = { colors: palettes.dark }) {
        seenColors.push(colors.ray);
      },
    };
    const definition = presentation({
      title: 'Test presentation',
      palettes,
      palette: 'dark',
      topics: ['first', 'second'].map((id) =>
        topic(id, [sceneSlides('shapes', async () => scene)]),
      ),
    });
    const initial = { ...assets(), palette: { name: 'dark', colors: palettes.dark } };
    const { deck, root, navigate } = createDeck();
    root.style.color = 'red';
    root.style.setProperty('--r-main-color', 'orange');
    const mutableDefinition = {
      ...definition,
      palettes: { dark: { ...palettes.dark }, light: { ...palettes.light } },
    };
    const plugin = manimPresentation(mutableDefinition, { assets: initial });
    mutableDefinition.palettes.light.ray = '#ff0000';
    await plugin.init(deck);
    navigate(1, 1);
    await flush();
    const currentId = deck.getCurrentSlide().id;
    const selector = document.querySelector<HTMLSelectElement>('[aria-label="Color palette"]')!;
    expect(selector.value).toBe('dark');
    expect(seenColors.at(-1)).toBe(palettes.dark.ray);

    const updated = { ...assets(), palette: { name: 'light', colors: palettes.light } };
    for (const scene of Object.values(updated.scenes))
      for (const snapshot of Object.values(scene.snapshots))
        snapshot.image = 'data:image/png;base64,bA==';
    const compile = vi.spyOn(compilation, 'compilePresentation').mockResolvedValue(updated);
    await plugin.setPalette('light');
    expect(plugin.palette).toBe('light');
    expect(definition.palette).toBe('dark');
    expect(seenColors.at(-1)).toBe(palettes.light.ray);
    expect(deck.getCurrentSlide().id).toBe(currentId);
    expect(players.at(-1)!.calls.at(-1)).toBe('seek:two:end');
    expect(players.at(-1)!.isPlaying).toBe(false);
    expect(selector.value).toBe('light');
    expect(selector.disabled).toBe(false);
    expect(root.style.getPropertyValue('--manim-text')).toBe(palettes.light.text);
    expect(
      document.querySelector<HTMLElement>('.manim-handout')!.style.getPropertyValue('--manim-ray'),
    ).toBe(palettes.light.ray);
    expect(plugin.exportAssets()).toEqual(updated);
    for (const image of document.querySelectorAll<HTMLImageElement>('.manim-snapshot img'))
      expect(image.src).toBe('data:image/png;base64,bA==');

    await expect(plugin.setPalette('missing')).rejects.toThrow();
    await plugin.setPalette('light');
    expect(compile).toHaveBeenCalledTimes(1);
    compile.mockRejectedValue(new Error('Could not render the new palette'));
    const previous = players.at(-1)!;
    await expect(plugin.setPalette('dark')).rejects.toThrow('Could not render the new palette');
    expect(plugin.palette).toBe('light');
    expect(plugin.ready).toBe(true);
    expect(previous.disposed).toBe(false);
    expect(plugin.exportAssets()).toEqual(updated);
    expect(selector.value).toBe('light');
    expect(selector.disabled).toBe(false);

    const other = createDeck();
    const otherPlugin = manimPresentation(definition, { assets: initial, controls: false });
    await otherPlugin.init(other.deck);
    await flush();
    expect(otherPlugin.palette).toBe('dark');
    expect(other.root.style.getPropertyValue('--manim-ray')).toBe(palettes.dark.ray);
    expect(root.style.getPropertyValue('--manim-ray')).toBe(palettes.light.ray);
    otherPlugin.destroy();
    plugin.destroy();
    expect(root.style.color).toBe('red');
    expect(root.style.getPropertyValue('--r-main-color')).toBe('orange');
    expect(root.style.getPropertyValue('--manim-ray')).toBe('');
  });

  // MIGRATION: refreshing appearance preserves checkpoint identity, updates all
  // previews/print pages, and cannot attach content after the owner is destroyed.
  it('refreshes snapshots and live playback at the current checkpoint', async () => {
    const scene: SceneDefinition = { build: async () => {} };
    const definition = presentation({
      title: 'Test presentation',
      topics: ['first', 'second'].map((id) =>
        topic(id, [sceneSlides('shapes', async () => scene, { background: '#000000' })]),
      ),
    });
    const { deck, navigate, slides } = createDeck();
    const plugin = manimPresentation(definition, { assets: assets() });
    await plugin.init(deck);
    navigate(1, 1);
    await flush();
    const previous = players.at(-1)!;
    const currentId = deck.getCurrentSlide().id;
    const updated = assets();
    for (const scene of Object.values(updated.scenes)) {
      for (const snapshot of Object.values(scene.snapshots))
        snapshot.image = 'data:image/png;base64,bA==';
    }
    for (const topic of definition.topics) topic.slides[0].background = '#ffffff';
    const compile = vi.spyOn(compilation, 'compilePresentation').mockResolvedValue(updated);
    await plugin.refresh();
    await flush();
    expect(deck.getCurrentSlide().id).toBe(currentId);
    expect(deck.getCurrentSlide().style.backgroundColor).toBe('#ffffff');
    expect(previous.disposed).toBe(true);
    expect(players.at(-1)!.calls.at(-1)).toBe('seek:two:end');
    expect(players.at(-1)!.isPlaying).toBe(false);
    expect(plugin.exportAssets()).toEqual(updated);
    expect(document.querySelectorAll('.manim-handout')).toHaveLength(1);
    for (const image of document.querySelectorAll<HTMLImageElement>('.manim-snapshot img')) {
      expect(image.src).toBe('data:image/png;base64,bA==');
    }
    let finish!: (result: PresentationAssets) => void;
    compile.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const refreshing = plugin.refresh();
    await flush();
    await expect(plugin.refresh()).rejects.toThrow('not ready to refresh');
    plugin.destroy();
    const content = slides.innerHTML;
    finish(updated);
    await refreshing;
    expect(plugin.ready).toBe(false);
    expect(slides.querySelector('.manim-live')).toBeNull();
    expect(document.querySelector('.manim-handout')).toBeNull();
    expect(document.querySelector('.manim-loading')).toBeNull();
    expect(slides.innerHTML).toBe(content);
  });

  // MIGRATION: pending forward navigation hides completed posters synchronously,
  // and cancellation restores them without allowing stale loads to reveal one.
  it('hides completed previews until the destination starts playing', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scene: SceneDefinition = { build: async () => {} };
    const definition = presentation({
      title: 'Test presentation',
      topics: [
        topic('first', [sceneSlides('shapes', async () => scene)]),
        topic('second', [
          sceneSlides('shapes', async () => {
            await pending;
            return scene;
          }),
        ]),
      ],
    });
    const { deck, navigate } = createDeck();
    const plugin = manimPresentation(definition, { assets: assets() });
    await plugin.init(deck);
    await flush();
    const destination = plugin.routes.find((route) => route.id === 'second/shapes/one')!.element;
    const poster = destination.querySelector<HTMLElement>('.manim-poster')!;
    const initialVisibility = getComputedStyle(poster).visibility;
    navigate(1, 0);
    expect(getComputedStyle(poster).visibility).toBe('hidden');
    navigate(0, 0);
    expect(getComputedStyle(poster).visibility).toBe(initialVisibility);
    navigate(1, 0);
    release();
    await flush();
    expect(destination.dataset.preparing).toBeUndefined();
    expect(destination.dataset.live).toBe('true');
    expect(getComputedStyle(poster).visibility).toBe('hidden');
    expect(players.at(-1)!.calls.at(-1)).toBe('play:one');
  });

  // MIGRATION: authored checkpoints map bijectively to native (h,v) leaves and
  // flat handout pages; backward/overview navigation restores completed states.
  it('uses both axes, prepares unvisited print pages, and preserves print playback', async () => {
    const scene: SceneDefinition = { build: async () => {} };
    const definition = presentation({
      title: 'Test presentation',
      topics: [
        topic('first', [sceneSlides('shapes', async () => scene)]),
        topic('second', [
          sceneSlides('shapes', async () => scene),
          blankSlide('discussion', { background: '#102030' }),
        ]),
      ],
    });
    const { deck, slides, emit, navigate } = createDeck();
    const plugin = manimPresentation(definition, { assets: assets() });
    await plugin.init(deck);
    await flush();
    expect(slides.querySelectorAll(':scope > section')).toHaveLength(2);
    expect(slides.querySelectorAll(':scope > section > section')).toHaveLength(5);
    expect(slides.querySelectorAll('section section section')).toHaveLength(0);
    expect(document.querySelectorAll('.manim-handout > .manim-page')).toHaveLength(5);
    expect(
      document.querySelector('.manim-handout > .manim-page:last-child')?.getAttribute('style'),
    ).toContain('#102030');
    expect(players[0].calls).toContain('seek:one:end');

    navigate(0, 1);
    expect(players[0].calls.at(-1)).toBe('play:two');
    window.dispatchEvent(new Event('beforeprint'));
    expect(players[0].isPlaying).toBe(false);
    window.dispatchEvent(new Event('afterprint'));
    expect(players[0].isPlaying).toBe(true);
    navigate(0, 0);
    expect(players[0].calls.at(-1)).toBe('seek:one:end');
    emit('overviewshown');
    navigate(1, 1);
    emit('overviewhidden');
    await flush();
    expect(players[0].disposed).toBe(true);
    expect(players[1].calls.at(-1)).toBe('seek:two:end');
  });

  // MIGRATION: any superseded async scene preparation is disposed and can never
  // replace the current route, including when the new route contains static HTML.
  it('discards late scene loads after navigation to static content', async () => {
    let finishBuild!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishBuild = resolve;
    });
    const definition = presentation({
      title: 'Test presentation',
      topics: [
        topic('first', [sceneSlides('shapes', async () => ({ build: () => pending }))]),
        topic('closing', [markdownSlide('thanks', '# Thank you')]),
      ],
    });
    const { deck, navigate } = createDeck();
    const plugin = manimPresentation(definition, { assets: assets() });
    await plugin.init(deck);
    await flush();
    navigate(1, 0);
    finishBuild();
    await flush();
    expect(players).toHaveLength(1);
    expect(players[0].disposed).toBe(true);
    expect(plugin.player).toBeUndefined();
    expect(document.querySelector('.manim-live')).toBeNull();
    expect(deck.getCurrentSlide().textContent).toContain('Thank you');
  });

  // MIGRATION: across rapid route changes, unresolved scene preparation owns
  // at most one player; queued obsolete routes must allocate no resources.
  it('bounds preparation while skipping superseded queued scenes', async () => {
    let finishBuild!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishBuild = resolve;
    });
    const definition = presentation({
      title: 'Test presentation',
      topics: [
        topic('first', [sceneSlides('shapes', async () => ({ build: () => pending }))]),
        topic('second', [sceneSlides('shapes', async () => ({ build: async () => {} }))]),
      ],
    });
    const { deck, navigate } = createDeck();
    const plugin = manimPresentation(definition, { assets: assets() });
    await plugin.init(deck);
    await flush();
    expect(players).toHaveLength(1);
    navigate(1, 0);
    await flush();
    navigate(0, 1);
    await flush();
    expect(players).toHaveLength(1);
    finishBuild();
    await flush();
    expect(players).toHaveLength(2);
    expect(players.filter((player) => !player.disposed)).toHaveLength(1);
    expect(players[1].calls.at(-1)).toBe('seek:two:end');
  });
});
