import type {
  PresentationDefinition,
  PresentationOptions,
  PresentationSlide,
  PresentationTopic,
  SceneSlides,
  SlideAppearance,
  StaticSlide,
} from './types';
import { darkColors, definePalettes, lightColors, resolvePresentationPalette } from './palettes';
import { resolveSlideTheme } from './slideTheme';

export function assertId(id: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
    throw new Error(
      `Invalid presentation ID "${id}"; use letters, digits, underscores and hyphens.`,
    );
  }
}

/**
 * Normalize flat slides into horizontal topics and validate addressable IDs.
 * @post result.topics.every(item => item.slides.length > 0)
 */
export function presentation(options: PresentationOptions): PresentationDefinition {
  if ((options.topics !== undefined) === (options.slides !== undefined))
    throw new Error('A presentation needs either slides or topics, but not both.');
  const { slides: flatSlides, ...metadata } = options;
  const definition: PresentationDefinition = {
    ...metadata,
    topics:
      options.topics ??
      flatSlides!.map((slide) => topic(slide.id, [slide], { title: slide.title })),
  };
  normalizeTheme(definition);
  const palette = resolvePresentationPalette(definition);
  const topics = new Set<string>();
  for (const item of definition.topics) {
    assertId(item.id);
    if (item.slides.length === 0) throw new Error(`Topic has no slides: ${item.id}`);
    if (topics.has(item.id)) throw new Error(`Duplicate topic ID: ${item.id}`);
    topics.add(item.id);
    const slides = new Set<string>();
    for (const slide of item.slides) {
      assertId(slide.id);
      if (slides.has(slide.id)) throw new Error(`Duplicate slide ID: ${item.id}/${slide.id}`);
      slides.add(slide.id);
    }
  }
  return palette
    ? { ...definition, palettes: definePalettes(definition.palettes!), palette: palette.name }
    : definition;
}

function normalizeTheme(definition: PresentationDefinition): void {
  const theme = definition.theme;
  if (!theme) return;
  if (theme.preset !== undefined && theme.preset !== 'dark' && theme.preset !== 'light')
    throw new Error('Presentation theme preset must be dark or light.');
  resolveSlideTheme(theme);
  definition.theme = Object.freeze({
    ...theme,
    ...(theme.colors && { colors: Object.freeze({ ...theme.colors }) }),
  });
  if (!definition.palettes && (theme.preset || theme.colors)) {
    definition.palettes = { dark: darkColors, light: lightColors };
    definition.palette ??= theme.preset ?? 'dark';
  }
  if (definition.palettes && theme.colors) {
    definition.palettes = Object.fromEntries(
      Object.entries(definition.palettes).map(([name, colors]) => [
        name,
        resolveSlideTheme({ colors: theme.colors }, colors).colors,
      ]),
    );
  }
}

export function topic(
  id: string,
  slides: readonly PresentationSlide[],
  metadata: Pick<PresentationTopic, 'title' | 'chapter'> = {},
): PresentationTopic {
  return { id, slides, ...metadata };
}

export function sceneSlides(
  id: string,
  load: SceneSlides['load'],
  appearance: SlideAppearance = {},
): SceneSlides {
  return { kind: 'scene', id, load, ...appearance };
}

export function htmlSlide(id: string, html: string, appearance: SlideAppearance = {}): StaticSlide {
  return { kind: 'html', id, content: html, ...appearance };
}

export function markdownSlide(
  id: string,
  markdown: string,
  appearance: SlideAppearance = {},
): StaticSlide {
  return { kind: 'markdown', id, content: markdown, ...appearance };
}

export function imageSlide(
  id: string,
  source: string,
  options: SlideAppearance & Pick<StaticSlide, 'alt' | 'caption' | 'fit'> = {},
): StaticSlide {
  return { kind: 'image', id, content: source, ...options };
}

export function videoSlide(
  id: string,
  source: string,
  options: SlideAppearance &
    Pick<StaticSlide, 'poster' | 'caption' | 'fit' | 'autoplay' | 'muted' | 'loop'> = {},
): StaticSlide {
  return { kind: 'video', id, content: source, ...options };
}

export function audioSlide(
  id: string,
  source: string,
  options: SlideAppearance & Pick<StaticSlide, 'caption' | 'autoplay' | 'loop'> = {},
): StaticSlide {
  return { kind: 'audio', id, content: source, ...options };
}

export function blankSlide(id: string, appearance: SlideAppearance = {}): StaticSlide {
  return { kind: 'blank', id, content: '', ...appearance };
}
