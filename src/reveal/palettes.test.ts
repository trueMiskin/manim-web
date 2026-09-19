import { expect, it } from 'vitest';
import { darkColors, definePalettes, lightColors, resolvePresentationPalette } from './palettes';

// MIGRATION: every valid collection retains all shared roles, isolates its input,
// and rejects any palette with missing or additional roles.
it('copies matching palettes and validates custom roles', () => {
  const input = {
    dark: { ...darkColors, ray: '#00ffff' },
    light: { ...lightColors, ray: '#003b8e' },
  };
  const palettes = definePalettes(input);
  input.light.ray = '#ffffff';
  expect(palettes.light.ray).toBe('#003b8e');
  expect(Object.isFrozen(palettes)).toBe(true);
  expect(Object.values(palettes).every(Object.isFrozen)).toBe(true);
  expect(() =>
    // @ts-expect-error Every palette must include the custom role.
    definePalettes({ dark: { ...darkColors, ray: '#00ffff' }, light: lightColors }),
  ).toThrow('same color roles');
  expect(() => definePalettes({ dark: { ...darkColors, text: '' } })).toThrow('nonempty strings');
  expect(() => definePalettes({})).toThrow('at least one');
});

// MIGRATION: an omitted selection chooses the first configured palette, while
// explicit selections resolve by own name and never silently fall back.
it('resolves palette selection without changing unthemed decks', () => {
  const palettes = definePalettes({ dark: darkColors, light: lightColors });
  expect(resolvePresentationPalette({})).toBeUndefined();
  expect(resolvePresentationPalette({ palettes })).toEqual({ name: 'dark', colors: darkColors });
  expect(resolvePresentationPalette({ palettes, palette: 'light' })).toEqual({
    name: 'light',
    colors: lightColors,
  });
  expect(() => resolvePresentationPalette({ palettes, palette: 'missing' })).toThrow('Unknown');
  expect(() => resolvePresentationPalette({ palette: 'light' })).toThrow('requires');
});
