import { Text, type Vector3Tuple } from 'manim-web';
import type { SlideThemeOptions } from 'manim-web/reveal';
import { SOURCE_FONT, SOURCE_FONT_BOLD } from './source-font';
export { SOURCE_FONT, SOURCE_FONT_BOLD, prepareSourceFonts } from './source-font';

// One typography and spacing system for every slide in the deck.
export const TECH_THEME = {
  fontFamily: SOURCE_FONT.fontFamily,
  fontUrl: SOURCE_FONT.fontUrl,
  titleFontFamily: SOURCE_FONT_BOLD.fontFamily,
  titleFontUrl: SOURCE_FONT_BOLD.fontUrl,
  titleSize: 36,
  titleAlign: 'center',
} satisfies SlideThemeOptions;

export function label(
  text: string,
  size: number,
  color: string,
  position: Vector3Tuple = [0, 0, 0],
): Text {
  return new Text({ ...SOURCE_FONT, text, fontSize: size, color }).moveTo(position);
}

/** A fixed screen-space heading for the manually authored 3D scene. */
export function heading(title: string, color: string): Text {
  return new Text({
    text: title,
    fontSize: 36,
    ...SOURCE_FONT_BOLD,
    color,
  }).moveTo([0, 3.25, 0]);
}
