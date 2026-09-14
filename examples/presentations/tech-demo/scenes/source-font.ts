import { fontFamilyForUrl, loadFontFace } from '../../../../src/mobjects/text/TextFont';

const regularUrl = new URL('../assets/fonts/DroidSans.ttf', import.meta.url).href;
const boldUrl = new URL('../assets/fonts/DroidSans-Bold.ttf', import.meta.url).href;

export const SOURCE_FONT = {
  fontFamily: `'${fontFamilyForUrl(regularUrl)}'`,
  fontUrl: regularUrl,
  fontWeight: 'normal' as const,
};
export const SOURCE_FONT_BOLD = {
  fontFamily: `'${fontFamilyForUrl(boldUrl)}'`,
  fontUrl: boldUrl,
  fontWeight: 'bold' as const,
};

/** Await before constructing labels so source layout uses the final font metrics. */
export async function prepareSourceFonts(): Promise<void> {
  await Promise.all([
    loadFontFace(regularUrl),
    loadFontFace(boldUrl, undefined, { weight: 'bold', style: 'normal' }),
  ]);
}
