import {
  math,
  mountPresentation,
  paragraph,
  presentation,
  sceneSlides,
  slide,
  topic,
} from 'manim-web/reveal';
import fontUrl from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?url';
import 'katex/dist/katex.min.css';

const deck = presentation({
  title: 'First independent deck',
  theme: { fontFamily: 'KaTeX_Main', fontUrl, duration: 0.01 },
  topics: [
    topic('intro', [
      slide('content', {
        title: 'First independent deck',
        content: [paragraph('One library serves every presentation.'), math('x^2 + y^2 = 1')],
      }),
    ]),
    topic('geometry', [sceneSlides('circle', () => import('./scene'))]),
  ],
});

await mountPresentation('#presentation', deck, {
  assets: import.meta.env.PROD ? './manim-handout.json' : undefined,
});
