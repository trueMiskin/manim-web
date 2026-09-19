// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { blankSlide, presentation, sceneSlides, topic } from './authoring';
import { compilePresentation, loadPresentationAssets, loadScene } from './compile';
import { darkColors, definePalettes, lightColors } from './palettes';
import type { SceneDefinition } from './types';
import type { RecordingScene } from '../player/RecordingScene';
import type { Player } from '../player/Player';

// MIGRATION: independently bound raw scenes receive stable colors even when
// another deck selects a different palette or the author edits the input map.
it('binds raw scene colors and preserves explicit scene backgrounds', async () => {
  const colors = { ...darkColors, ray: '#00ffff' };
  const palettes = definePalettes({ dark: colors, light: { ...lightColors, ray: '#003b8e' } });
  const build = vi.fn<SceneDefinition['build']>().mockResolvedValue(undefined);
  const standaloneBuild: Parameters<Player['sequence']>[0] = build;
  expect(standaloneBuild).toBe(build);
  const slide = sceneSlides('scene', async () => ({ build }));
  const deck = presentation({ title: 'Palettes', palettes, topics: [topic('one', [slide])] });
  const dark = await loadScene(slide, deck);
  const light = await loadScene(slide, { ...deck, palette: 'light' });
  colors.ray = '#ffffff';
  const recording = {} as RecordingScene;
  await dark.build(recording);
  await light.build(recording);
  expect(build.mock.calls.map(([, context]) => [context?.palette, context?.colors.ray])).toEqual([
    ['dark', '#00ffff'],
    ['light', '#003b8e'],
  ]);
  expect(dark.options?.backgroundColor).toBe(darkColors.background);
  expect(light.options?.backgroundColor).toBe(lightColors.background);
  const fixed = await loadScene(
    sceneSlides('fixed', async () => ({ build, options: { backgroundColor: '#ff0000' } })),
    deck,
  );
  expect(fixed.options?.backgroundColor).toBe('#ff0000');
});

// MIGRATION: compiled assets are reusable exactly when palette name and every
// resolved role match; legacy assets remain valid for decks without palettes.
it('validates snapshot palettes by both name and color content', async () => {
  const plain = presentation({ title: 'Palettes', topics: [topic('one', [blankSlide('blank')])] });
  const legacy = await compilePresentation(plain);
  expect(legacy).not.toHaveProperty('palette');
  await expect(loadPresentationAssets(legacy, plain)).resolves.toBe(legacy);
  const palettes = definePalettes({ dark: darkColors, light: lightColors });
  const deck = presentation({ ...plain, palettes, palette: 'dark' });
  const assets = await compilePresentation(deck);
  expect(assets.palette).toEqual({ name: 'dark', colors: darkColors });
  await expect(loadPresentationAssets(assets, deck)).resolves.toBe(assets);
  await expect(loadPresentationAssets(legacy, deck)).rejects.toThrow('do not match');
  await expect(loadPresentationAssets(assets, { ...deck, palette: 'light' })).rejects.toThrow(
    'do not match',
  );
  await expect(
    loadPresentationAssets(assets, {
      ...deck,
      palettes: definePalettes({ dark: { ...darkColors, accent: '#123456' }, light: lightColors }),
    }),
  ).rejects.toThrow('do not match');
});
