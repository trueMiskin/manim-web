import { Text, type Vector3Tuple } from '../../../../src';
import type { SlideThemeOptions } from '../../../../src/reveal';
import { SOURCE_FONT, SOURCE_FONT_BOLD } from './source-font';
export { SOURCE_FONT, SOURCE_FONT_BOLD, prepareSourceFonts } from './source-font';

export const C = {
  bg: '#000000',
  card: '#161B22',
  text: '#F3F4F6',
  muted: '#8996A6',
  cyan: '#00FFFF',
  amber: '#FFB300',
  green: '#00E676',
  red: '#FF1744',
  border: '#30363D',
};
// One typography and spacing system for every slide in the deck.
export const TECH_THEME = {
  fontFamily: SOURCE_FONT.fontFamily,
  fontUrl: SOURCE_FONT.fontUrl,
  titleFontFamily: SOURCE_FONT_BOLD.fontFamily,
  titleFontUrl: SOURCE_FONT_BOLD.fontUrl,
  titleSize: 36,
  titleAlign: 'center',
  colors: {
    background: C.bg,
    text: C.text,
    muted: C.muted,
    accent: C.cyan,
    secondary: C.amber,
  },
} satisfies SlideThemeOptions;

export function label(
  text: string,
  size = 24,
  color = C.text,
  position: Vector3Tuple = [0, 0, 0],
): Text {
  return new Text({ ...SOURCE_FONT, text, fontSize: size, color }).moveTo(position);
}

/** A fixed screen-space heading for the manually authored 3D scene. */
export function heading(title: string): Text {
  return new Text({
    text: title,
    fontSize: 36,
    ...SOURCE_FONT_BOLD,
    color: C.text,
  }).moveTo([0, 3.25, 0]);
}
