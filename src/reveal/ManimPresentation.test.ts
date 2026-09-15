// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { manimPresentation } from './ManimPresentation';
import { blankSlide, markdownSlide, presentation, sceneSlides, topic } from './authoring';
import type { PresentationAssets, RevealDeck, RevealEvent, SceneDefinition } from './types';
import type { Slide } from '../animation/MasterTimeline';

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
