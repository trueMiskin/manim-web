import Reveal from 'reveal.js';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import { manimPresentation, presentation, sceneSlides, topic } from 'manim-web/reveal';
import { palettes } from './palettes';

await new Reveal(document.querySelector('.reveal') as HTMLElement, {
  hash: true,
  plugins: [
    manimPresentation(
      presentation({
        title: 'Low-level scene reference',
        palettes,
        palette: 'dark',
        topics: [topic('manual', [sceneSlides('circle', () => import('./scene'))])],
      }),
      { assets: import.meta.env.PROD ? './manim-handout.json' : undefined },
    ),
  ],
}).initialize({ transition: 'none', backgroundTransition: 'none' });
