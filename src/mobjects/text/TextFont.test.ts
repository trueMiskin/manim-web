// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fontFamilyForUrl, loadFontFace, preloadTextFonts } from './TextFont';

afterEach(() => vi.unstubAllGlobals());

describe('portable checkpoint fonts', () => {
  // MIGRATION: loading order and repeated registration never alter a URL's family.
  it('uses the same stable family for live text and prebuilt semantic snapshots', async () => {
    const added: { family: string }[] = [];
    const fonts = {
      add: (face: { family: string }) => added.push(face),
      load: vi.fn(async () => []),
    };
    vi.stubGlobal('document', { fonts });
    vi.stubGlobal(
      'FontFace',
      class {
        constructor(
          readonly family: string,
          readonly source: string,
        ) {}
        async load() {
          return this;
        }
      },
    );
    const first = '/fonts/portable-first.ttf';
    const second = '/fonts/portable-second.ttf';
    const expected = fontFamilyForUrl(first);
    await loadFontFace(second);
    expect(await loadFontFace(first)).toBe(expected);
    expect(fontFamilyForUrl(first)).toBe(expected);
    expect(expected).not.toBe(fontFamilyForUrl(second));
    await preloadTextFonts([
      {
        font: {
          family: `'${expected}'`,
          url: first,
          size: 24,
          weight: 'normal',
          style: 'normal',
          lineHeight: 1.2,
          letterSpacing: 0,
        },
      },
    ]);
    expect(added.filter((face) => face.family === expected)).toHaveLength(1);
    // A relocated handout registers the captured family at the deployment URL.
    await loadFontFace('/published/fonts/first.ttf', expected);
    expect(added.filter((face) => face.family === expected)).toHaveLength(2);
  });
});
