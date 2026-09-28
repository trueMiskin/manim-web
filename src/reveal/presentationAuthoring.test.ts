// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { Player } from '../player/Player';
import { blankSlide, presentation, sceneSlides, topic } from './authoring';
import { loadScene } from './compile';
import { defineSlide } from './defineSlide';
import { buildPresentationDocument } from './document';
import { darkColors, lightColors, resolvePresentationPalette } from './palettes';
import type { Slide } from '../animation/MasterTimeline';
import type { PresentationAssets } from './types';

const players: Player[] = [];

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return createCanvas(Math.max(1, this.width), Math.max(1, this.height)).getContext(
      '2d',
    ) as unknown as CanvasRenderingContext2D;
  });
});

afterEach(() => {
  players.splice(0).forEach((player) => player.dispose());
  vi.restoreAllMocks();
});

function makePlayer(): Player {
  const player = new Player(document.createElement('div'), {
    headless: true,
    ui: false,
    keyboard: false,
    pointer: false,
  });
  players.push(player);
  return player;
}

// MIGRATION: every flat slide advances horizontally, while its checkpoints
// advance vertically and retain stable topic/scene/checkpoint addresses.
it('normalizes a mixed flat deck into horizontal slides and vertical checkpoints', () => {
  const animated = sceneSlides('lesson', async () => ({ build: async () => {} }));
  const deck = presentation({ title: 'Lesson', slides: [blankSlide('intro'), animated] });
  const checkpoints: Slide[] = ['first', 'second'].map((id, index) => ({
    id,
    index,
    startTime: index,
    endTime: index + 1,
    startSegmentIndex: index,
    endSegmentIndex: index,
    playbackRate: 1,
    loop: false,
    autoNext: false,
  }));
  const assets: PresentationAssets = {
    version: 1,
    title: deck.title,
    width: 1280,
    height: 720,
    scenes: {
      'lesson/lesson': {
        checkpoints,
        snapshots: Object.fromEntries(
          checkpoints.map((checkpoint) => [
            checkpoint.id,
            {
              image: 'data:image/png;base64,aA==',
              text: [],
              width: 1280,
              height: 720,
              checkpoint,
            },
          ]),
        ),
      },
    },
  };
  const { routes } = buildPresentationDocument(deck, assets, document.createElement('div'));
  expect(routes.map(({ id, h, v }) => ({ id, h, v }))).toEqual([
    { id: 'intro/intro', h: 0, v: 0 },
    { id: 'lesson/lesson/first', h: 1, v: 0 },
    { id: 'lesson/lesson/second', h: 1, v: 1 },
  ]);
  expect(deck).not.toHaveProperty('slides');
  expect(presentation(deck)).toEqual(deck);
});

// MIGRATION: authoring accepts exactly one navigation structure and every
// normalized horizontal topic has a valid, unique ID.
it('rejects ambiguous structures and invalid flat slide identities', () => {
  // @ts-expect-error A deck must specify slides or topics.
  expect(() => presentation({ title: 'Missing' })).toThrow('either slides or topics');
  expect(() =>
    // @ts-expect-error A deck cannot specify both structures.
    presentation({ title: 'Both', slides: [blankSlide('one')], topics: [topic('one', [])] }),
  ).toThrow('not both');
  expect(() =>
    presentation({ title: 'Duplicate', slides: [blankSlide('one'), blankSlide('one')] }),
  ).toThrow('Duplicate topic ID');
  expect(() => presentation({ title: 'Invalid', slides: [blankSlide('bad/id')] })).toThrow(
    'Invalid presentation ID',
  );
});

// MIGRATION: built-in presets establish deck-wide palettes only in the absence
// of explicit palettes; deck color overrides are consistent in every palette.
it('resolves presets and deck color overrides without replacing named palettes', () => {
  const theme = { preset: 'light' as const, colors: { accent: '#cc5500' } };
  const deck = presentation({ title: 'Light', theme, slides: [blankSlide('intro')] });
  theme.colors.accent = '#ffffff';
  expect(Object.keys(deck.palettes!)).toEqual(['dark', 'light']);
  expect(resolvePresentationPalette(deck)).toEqual({
    name: 'light',
    colors: { ...lightColors, accent: '#cc5500' },
  });
  expect(resolvePresentationPalette({ ...deck, palette: 'dark' })?.colors.accent).toBe('#cc5500');
  const named = presentation({
    title: 'Custom',
    theme: { preset: 'light' },
    palettes: { custom: darkColors },
    slides: [blankSlide('intro')],
  });
  expect(resolvePresentationPalette(named)).toEqual({ name: 'custom', colors: darkColors });
});

// MIGRATION: independent builds inherit their own deck typography and palette,
// while slide overrides win and rebinding colors preserves inherited typography.
it('inherits typography and colors independently for each build', async () => {
  const authored = defineSlide(
    { title: 'Heading', theme: { titleSize: 34, colors: { accent: '#cc0000' } } },
    async (s) => {
      const body = s.paragraph('Body');
      const accent = s.paragraph('Accent', { color: 'accent' });
      await s.step({ id: 'content' }, () => s.show(body, accent));
    },
  );
  const slide = sceneSlides('lesson', async () => authored);
  const firstTheme = { preset: 'dark' as const, fontFamily: 'serif', bodySize: 20, titleSize: 46 };
  const firstDeck = presentation({ title: 'First', theme: firstTheme, slides: [slide] });
  const secondDeck = presentation({
    title: 'Second',
    theme: { preset: 'light', fontFamily: 'monospace', bodySize: 26, titleSize: 50 },
    slides: [slide],
  });
  const first = await loadScene(slide, firstDeck);
  const second = await loadScene(slide, secondDeck);
  firstTheme.bodySize = 38;
  const recolored = first.withPalette!({ colors: lightColors, palette: 'light' });
  const rendered = [];
  for (const definition of [first, second, recolored]) {
    const player = makePlayer();
    await player.sequence(definition.build);
    player.seekCheckpoint('content');
    rendered.push(
      Object.fromEntries(
        player
          .inspectText()
          .map(({ text, color, font }) => [text, { color, family: font.family, size: font.size }]),
      ),
    );
  }
  expect(rendered).toEqual([
    {
      Heading: { color: darkColors.text, family: 'serif', size: 34 },
      Body: { color: darkColors.text, family: 'serif', size: 20 },
      Accent: { color: '#cc0000', family: 'serif', size: 20 },
    },
    {
      Heading: { color: lightColors.text, family: 'monospace', size: 34 },
      Body: { color: lightColors.text, family: 'monospace', size: 26 },
      Accent: { color: '#cc0000', family: 'monospace', size: 26 },
    },
    {
      Heading: { color: lightColors.text, family: 'serif', size: 34 },
      Body: { color: lightColors.text, family: 'serif', size: 20 },
      Accent: { color: '#cc0000', family: 'serif', size: 20 },
    },
  ]);
  expect(first.options?.backgroundColor).toBe(darkColors.background);
  expect(second.options?.backgroundColor).toBe(lightColors.background);
});
