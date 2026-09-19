import Reveal from 'reveal.js';
import RevealNotes from 'reveal.js/plugin/notes';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import {
  manimPresentation,
  markdownSlide,
  presentation,
  sceneSlides,
  topic,
} from 'manim-web/reveal';
import { palettes } from './palettes';

const plugin = manimPresentation(
  presentation({
    title: 'A short lesson: gradient descent',
    palettes,
    palette: 'dark',
    topics: [
      topic('idea', [sceneSlides('gradient', () => import('./gradient'))]),
      topic('example', [
        sceneSlides('quadratic', () => import('./quadratic')),
        markdownSlide(
          'recap',
          String.raw`## One idea to remember

For $f(x)=x^2$, gradient descent becomes

$$x_{k+1}=(1-2\eta)x_k.$$

A step size $0 < \eta < \frac{1}{2}$ moves steadily toward the minimum.`,
          { notes: 'An ordinary Markdown slide can include inline and display formulas too.' },
        ),
      ]),
    ],
  }),
  { assets: import.meta.env.PROD ? './manim-handout.json' : undefined },
);

await new Reveal(document.querySelector('.reveal') as HTMLElement, {
  hash: true,
  plugins: [plugin, RevealNotes],
}).initialize({
  transition: 'none',
  backgroundTransition: 'none',
});
