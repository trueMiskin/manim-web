// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountPresentation, type MountedPresentation } from './mountPresentation';
import type { PresentationDefinition } from './types';

const harness = vi.hoisted(() => {
  interface TestPlugin {
    id: string;
    init?: (deck: FakeDeck) => Promise<void>;
    destroy?: () => void;
  }
  const state = { failure: undefined as Error | undefined };
  class FakeDeck {
    initialized = false;
    destroy = vi.fn(() => this.plugins.forEach((plugin) => plugin.destroy?.()));
    readonly plugins: TestPlugin[];
    constructor(
      readonly root: HTMLElement,
      readonly options: {
        hash?: boolean;
        transition?: string;
        backgroundTransition?: string;
        plugins: Array<TestPlugin | (() => TestPlugin)>;
      },
    ) {
      this.plugins = options.plugins.map((plugin) =>
        typeof plugin === 'function' ? plugin() : plugin,
      );
      decks.push(this);
    }
    async initialize(): Promise<void> {
      for (const plugin of this.plugins) await plugin.init?.(this);
      this.initialized = true;
    }
  }
  const decks: FakeDeck[] = [];
  const createPlugin = vi.fn(() => {
    const plugin = {
      id: 'manim-web',
      ready: false,
      async init(deck: FakeDeck) {
        deck.root.querySelector('.slides')!.replaceChildren(document.createElement('section'));
        if (state.failure) throw state.failure;
        plugin.ready = true;
      },
      destroy: vi.fn(() => {
        plugin.ready = false;
      }),
    };
    return plugin;
  });
  const notes = vi.fn(() => ({ id: 'notes' }));
  return { state, FakeDeck, decks, createPlugin, notes };
});

vi.mock('reveal.js', () => ({ default: harness.FakeDeck }));
vi.mock('reveal.js/plugin/notes', () => ({ default: harness.notes }));
vi.mock('reveal.js/reveal.css?inline', () => ({ default: '.reveal { display: block; }' }));
vi.mock('reveal.js/theme/black.css?inline', () => ({ default: '.reveal { color: white; }' }));
vi.mock('./ManimPresentation', () => ({ manimPresentation: harness.createPlugin }));

const definition: PresentationDefinition = { title: 'Mounted deck', topics: [] };
let mounted: MountedPresentation | undefined;

beforeEach(() => {
  harness.state.failure = undefined;
  harness.decks.length = 0;
  vi.clearAllMocks();
  document.body.innerHTML = '<main id="presentation"><p>Preserved</p></main>';
});

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
  document.body.replaceChildren();
});

// MIGRATION: mounting any presentation forwards its assets and owns only the
// scaffold/styles it creates; destroy is idempotent and permits remounting.
it('mounts a selector with defaults and cleans up only its own resources', async () => {
  mounted = await mountPresentation('#presentation', definition, { assets: '/handout.json' });
  const deck = harness.decks[0];
  expect(deck.options).toMatchObject({
    hash: true,
    transition: 'none',
    backgroundTransition: 'none',
  });
  expect(deck.plugins.map((plugin) => plugin.id)).toEqual(['manim-web', 'notes']);
  expect(harness.createPlugin).toHaveBeenCalledWith(definition, { assets: '/handout.json' });
  expect(mounted.plugin.ready).toBe(true);
  expect(document.querySelector('#presentation > .reveal > .slides > section')).not.toBeNull();
  expect(document.querySelector('style[data-manim-reveal]')).not.toBeNull();
  await expect(mountPresentation('#presentation', definition)).rejects.toThrow('already');

  mounted.destroy();
  mounted.destroy();
  expect(deck.destroy).toHaveBeenCalledTimes(1);
  expect(mounted.plugin.ready).toBe(false);
  expect(document.querySelector('#presentation')?.innerHTML).toBe('<p>Preserved</p>');
  expect(document.querySelector('style[data-manim-reveal]')).toBeNull();

  mounted = await mountPresentation('#presentation', definition, { styles: false, notes: false });
  expect(mounted.plugin.ready).toBe(true);
});

// MIGRATION: every failed plugin initialization rejects mount and restores
// existing slide nodes so the same container can be mounted successfully later.
it('restores existing slides after initialization failure and allows custom Reveal options', async () => {
  const root = document.querySelector<HTMLElement>('#presentation')!;
  root.className = 'reveal';
  root.innerHTML = '<div class="slides"><section>Original</section></div>';
  const original = root.querySelector('section');
  harness.state.failure = new Error('Invalid handout');
  await expect(
    mountPresentation(root, definition, { styles: false, notes: false }),
  ).rejects.toThrow('Invalid handout');
  expect(root.querySelector('section')).toBe(original);
  expect(harness.decks[0].initialized).toBe(true);
  expect(harness.decks[0].destroy).toHaveBeenCalledTimes(1);

  harness.state.failure = undefined;
  mounted = await mountPresentation(root, definition, {
    styles: false,
    notes: false,
    reveal: { hash: false, transition: 'fade', plugins: [{ id: 'extra' }] },
  });
  expect(harness.decks[1].options).toMatchObject({ hash: false, transition: 'fade' });
  expect(harness.decks[1].plugins.map((plugin) => plugin.id)).toEqual(['manim-web', 'extra']);
  expect(harness.notes).not.toHaveBeenCalled();
  expect(document.querySelector('style[data-manim-reveal]')).toBeNull();
  mounted.destroy();
  expect(root.querySelector('section')).toBe(original);
});
