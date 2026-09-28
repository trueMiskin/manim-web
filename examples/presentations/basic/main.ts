import { mountPresentation } from 'manim-web/reveal';
import { deck } from './deck';

await mountPresentation('#presentation', deck, {
  assets: import.meta.env.PROD ? './manim-handout.json' : undefined,
});
