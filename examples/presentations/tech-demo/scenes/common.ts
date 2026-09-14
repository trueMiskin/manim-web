import { Text, type Vector3Tuple } from '../../../../src';
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
export function label(
  text: string,
  size = 24,
  color = C.text,
  position: Vector3Tuple = [0, 0, 0],
): Text {
  return new Text({ ...SOURCE_FONT, text, fontSize: size, color }).moveTo(position);
}
export function heading(title: string): Text {
  return new Text({
    text: title,
    fontSize: 36,
    ...SOURCE_FONT_BOLD,
    color: C.text,
  }).moveTo([0, 3.25, 0]);
}
