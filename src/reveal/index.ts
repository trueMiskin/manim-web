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
export { ManimPresentation, manimPresentation } from './ManimPresentation';
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
} from './slideBlocks';
export { DEFAULT_SLIDE_THEME, type SlideTheme, type SlideThemeOptions } from './slideTheme';
export type { SlidePlacement, SlideAlignment } from './slideLayout';
