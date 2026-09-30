export {
  presentation,
  topic,
  sceneSlides,
  htmlSlide,
  markdownSlide,
  imageSlide,
  videoSlide,
  audioSlide,
  blankSlide,
} from './authoring';
export { slide, type DeclarativeSlideOptions, type SlideBuild } from './declarative';
export {
  paragraph,
  math,
  bullets,
  image,
  columns,
  slot,
  type ContentBlock,
  type ContentBlockOptions,
  type SlideContent,
  type ParagraphBlock,
  type MathBlock,
  type BulletsBlock,
  type BulletItem,
  type ImageBlock,
  type ImageBlockOptions,
  type ColumnsBlock,
  type SlotBlock,
} from './declarativeBlocks';
export {
  transformMath,
  type SlideEffect,
  type TransformMathEffect,
  type TransformMathOptions,
} from './declarativeEffects';
export { ManimPresentation, manimPresentation } from './ManimPresentation';
export {
  mountPresentation,
  type MountPresentationOptions,
  type MountedPresentation,
} from './mountPresentation';
export { compilePresentation } from './compile';
export type * from './types';
export {
  defineSlide,
  SlideContext,
  type ContentSlideOptions,
  type SlideTarget,
} from './defineSlide';
export {
  SlideRegion,
  SlideBullets,
  type SlideTextOptions,
  type SlideMathOptions,
  type SlideFigureOptions,
  type SlideFigure,
} from './slideBlocks';
export {
  DEFAULT_SLIDE_THEME,
  type SlideTheme,
  type SlideThemeOptions,
  type PresentationThemeOptions,
} from './slideTheme';
export {
  definePalettes,
  darkColors,
  lightColors,
  type ColorPalette,
  type PaletteCollection,
  type ResolvedPalette,
} from './palettes';
export type { SlidePlacement, SlideAlignment } from './slideLayout';
