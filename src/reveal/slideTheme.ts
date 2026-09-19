import type { SlideAlignment } from './slideLayout';

/** Shared typography and spacing for content authored with defineSlide. */
export interface SlideTheme {
  fontFamily: string;
  fontUrl?: string;
  titleFontFamily?: string;
  titleFontUrl?: string;
  /** Horizontal title alignment. Defaults to center; body alignment is independent. */
  titleAlign?: SlideAlignment;
  titleSize: number;
  bodySize: number;
  captionSize?: number;
  mathSize: number;
  lineHeight: number;
  margin: number;
  gap: number;
  captionGap?: number;
  itemGap: number;
  columnGap: number;
  duration: number;
  colors: {
    background: string;
    text: string;
    muted: string;
    accent: string;
    secondary: string;
  };
}

export type SlideThemeOptions = Partial<Omit<SlideTheme, 'colors'>> & {
  colors?: Partial<SlideTheme['colors']>;
};

type ResolvedSlideTheme = SlideTheme &
  Required<Pick<SlideTheme, 'titleAlign' | 'captionSize' | 'captionGap'>>;

export const DEFAULT_SLIDE_THEME: Readonly<ResolvedSlideTheme> = Object.freeze({
  fontFamily: 'sans-serif',
  titleSize: 42,
  titleAlign: 'center',
  bodySize: 28,
  captionSize: 22,
  mathSize: 40,
  lineHeight: 1.35,
  margin: 0.65,
  gap: 0.4,
  captionGap: 0.2,
  itemGap: 0.22,
  columnGap: 0.7,
  duration: 0.65,
  colors: Object.freeze({
    background: '#10141c',
    text: '#f3f4f6',
    muted: '#b8c2d1',
    accent: '#58c4dd',
    secondary: '#f4cf6b',
  }),
});

/** Resolve a palette role (such as "accent") or retain an ordinary CSS color. */
export function slideColor(theme: SlideTheme, color = 'text'): string {
  return Object.prototype.hasOwnProperty.call(theme.colors, color)
    ? theme.colors[color as keyof SlideTheme['colors']]
    : color;
}

/** @post result.colors !== DEFAULT_SLIDE_THEME.colors */
export function resolveSlideTheme(options: SlideThemeOptions = {}): ResolvedSlideTheme {
  const theme = {
    ...DEFAULT_SLIDE_THEME,
    ...options,
    titleAlign: options.titleAlign ?? DEFAULT_SLIDE_THEME.titleAlign,
    captionSize: options.captionSize ?? DEFAULT_SLIDE_THEME.captionSize,
    captionGap: options.captionGap ?? DEFAULT_SLIDE_THEME.captionGap,
    colors: { ...DEFAULT_SLIDE_THEME.colors, ...options.colors },
  };
  if (!['left', 'center', 'right'].includes(theme.titleAlign))
    throw new Error('Slide titleAlign must be left, center, or right.');
  for (const key of ['titleSize', 'bodySize', 'captionSize', 'mathSize', 'lineHeight'] as const) {
    if (!Number.isFinite(theme[key]) || theme[key] <= 0)
      throw new Error(`Slide theme ${key} must be a positive finite number.`);
  }
  for (const key of ['margin', 'gap', 'captionGap', 'itemGap', 'columnGap', 'duration'] as const) {
    if (!Number.isFinite(theme[key]) || theme[key] < 0)
      throw new Error(`Slide theme ${key} must be a nonnegative finite number.`);
  }
  return theme;
}
