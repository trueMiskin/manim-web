/**
 * Global cache: fontUrl -> { familyName, loadPromise }
 * Ensures the same OTF/TTF is loaded only once via @font-face,
 * and all Text instances sharing a URL get the same CSS family name.
 */
const fontFaceCache = new Map<string, { familyName: string; loadPromise: Promise<void> }>();
let fontFaceIdCounter = 0;

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
export async function loadFontFace(url: string): Promise<string> {
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

  const cached = fontFaceCache.get(url);
  if (cached) {
    await cached.loadPromise;
    return cached.familyName;
  }

  const familyName = `ManimFont_${fontFaceIdCounter++}`;
  const face = new FontFace(familyName, `url(${url})`);
  const loadPromise = (async () => {
    await face.load();
    document.fonts.add(face);
    await document.fonts.load(`1em '${familyName}'`);
  })().catch((error: unknown) => {
    fontFaceCache.delete(url);
    throw new Error(
      `Failed to load font ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });

  fontFaceCache.set(url, { familyName, loadPromise });
  await loadPromise;
  return familyName;
}
