import Reveal from 'reveal.js';
import RevealNotes from 'reveal.js/plugin/notes';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import { manimPresentation, presentation, topic, sceneSlides } from 'manim-web/reveal';

const content = presentation({
  title: 'A first manim-web presentation',
  topics: [
    topic('welcome', [
      sceneSlides('intro', () => import('./intro')),
      sceneSlides('bullets', () => import('./bullets')),
    ]),
    topic('geometry', [sceneSlides('circle', () => import('./scene'))]),
    topic('text', [sceneSlides('styles', () => import('./text'))]),
    topic('coordinates', [sceneSlides('point', () => import('./coordinates'))]),
    topic('matrices', [sceneSlides('product', () => import('./matrix'))]),
  ],
});

const plugin = manimPresentation(content, {
  assets: import.meta.env.PROD ? './manim-handout.json' : undefined,
});
const deck = new Reveal(document.querySelector('.reveal') as HTMLElement, {
  hash: true,
  plugins: [plugin, RevealNotes],
});
await deck.initialize({ transition: 'none', backgroundTransition: 'none' });
