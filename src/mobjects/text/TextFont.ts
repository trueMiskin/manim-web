import type { SemanticTextRun } from './TextSemantics';

/**
 * Global cache: font URL + family -> { familyName, loadPromise }
 * Ensures the same OTF/TTF is loaded only once via @font-face,
 * and all Text instances sharing a URL get the same CSS family name.
 */
const fontFaceCache = new Map<string, { familyName: string; loadPromise: Promise<void> }>();

/** Stable across load order, page instances and prebuilt checkpoint rendering. */
export function fontFamilyForUrl(url: string): string {
  let hash = 14695981039346656037n;
  for (const character of url) {
    hash ^= BigInt(character.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `ManimFont_${hash.toString(16).padStart(16, '0')}`;
}

/**
 * Load a font URL as a CSS @font-face rule (cached).
 * Returns the unique font-family name assigned to this URL.
 *
 * Why the extra `document.fonts.load(...)` call:
 * `face.load()` + `document.fonts.add(face)` is enough for `measureText`,
 * but Canvas 2D's `fillText` font matching is lazy — until the font has
 * been used in DOM layout or explicitly resolved via `document.fonts.load`,
 * the first draw after add can fall back to the previous family. This
 * showed up as wrong-font flickers in `Create`/`Transform` (issue #309).
 */
export async function loadFontFace(
  url: string,
  familyName = fontFamilyForUrl(url),
  font: Pick<SemanticTextRun['font'], 'weight' | 'style'> = { weight: 'normal', style: 'normal' },
): Promise<string> {
  // Font loading unavailable in non-DOM environments or DOM emulators that
  // omit the CSS Font Loading API (e.g. happy-dom). Probe the specific
  // members used below — a partial mock that has `.fonts` but not `.load`
  // or `.add` would otherwise crash.
  if (
    typeof document === 'undefined' ||
    typeof FontFace === 'undefined' ||
    typeof document.fonts?.add !== 'function' ||
    typeof document.fonts?.load !== 'function'
  ) {
    return '';
  }

  const descriptors = { weight: String(font.weight), style: font.style };
  const cacheKey = JSON.stringify([url, familyName, descriptors]);
  const cached = fontFaceCache.get(cacheKey);
  if (cached) {
    await cached.loadPromise;
    return cached.familyName;
  }

  const face = new FontFace(familyName, `url(${JSON.stringify(url)})`, descriptors);
  const loadPromise = (async () => {
    await face.load();
    document.fonts.add(face);
    await document.fonts.load(`${font.style} ${font.weight} 1em '${familyName}'`);
  })().catch((error: unknown) => {
    fontFaceCache.delete(cacheKey);
    throw new Error(
      `Failed to load font ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });

  fontFaceCache.set(cacheKey, { familyName, loadPromise });
  await loadPromise;
  return familyName;
}

/** Register checkpoint fonts before selection/printing, even without a live scene. */
export async function preloadTextFonts(
  runs: Iterable<Pick<SemanticTextRun, 'font'>>,
): Promise<void> {
  await Promise.all(
    Array.from(runs, async ({ font }) => {
      if (font.url) await loadFontFace(font.url, font.family.replace(/^(['"])(.*)\1$/, '$2'), font);
    }),
  );
}
