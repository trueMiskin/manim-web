/// <reference types="vite/client" />
import {
  markdownSlide,
  math,
  mountPresentation,
  paragraph,
  presentation,
  sceneSlides,
  slide,
  topic,
} from 'manim-web/reveal';
import fontUrl from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?url';

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
    topic('markdown', [
      markdownSlide(
        'math',
        String.raw`# Markdown math

An inline formula $x_i + y_i$ uses the presentation's math fonts.

$$
\sum_{i=1}^{n} x_i = \frac{n(n+1)}{2}
$$`,
      ),
    ]),
    topic('geometry', [sceneSlides('circle', () => import('./scene'))]),
  ],
});

await mountPresentation('#presentation', deck, {
  assets: import.meta.env.PROD ? './manim-handout.json' : undefined,
});
