/** Shared typography and spacing for content authored with defineSlide. */
export interface SlideTheme {
  fontFamily: string;
  fontUrl?: string;
  titleSize: number;
  bodySize: number;
  mathSize: number;
  lineHeight: number;
  margin: number;
  gap: number;
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

export const DEFAULT_SLIDE_THEME: Readonly<SlideTheme> = Object.freeze({
  fontFamily: 'sans-serif',
  titleSize: 42,
  bodySize: 28,
  mathSize: 40,
  lineHeight: 1.35,
  margin: 0.65,
  gap: 0.4,
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
export function resolveSlideTheme(options: SlideThemeOptions = {}): SlideTheme {
  const theme = {
    ...DEFAULT_SLIDE_THEME,
    ...options,
    colors: { ...DEFAULT_SLIDE_THEME.colors, ...options.colors },
  };
  for (const key of ['titleSize', 'bodySize', 'mathSize', 'lineHeight'] as const) {
    if (!Number.isFinite(theme[key]) || theme[key] <= 0)
      throw new Error(`Slide theme ${key} must be a positive finite number.`);
  }
  for (const key of ['margin', 'gap', 'itemGap', 'columnGap', 'duration'] as const) {
    if (!Number.isFinite(theme[key]) || theme[key] < 0)
      throw new Error(`Slide theme ${key} must be a nonnegative finite number.`);
  }
  return theme;
}
