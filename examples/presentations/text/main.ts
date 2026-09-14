import Reveal from 'reveal.js';
import RevealNotes from 'reveal.js/plugin/notes';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import { manimPresentation, presentation, topic, sceneSlides } from 'manim-web/reveal';

const plugin = manimPresentation(
  presentation({
    title: 'Animated, selectable text',
    topics: [topic('text', [sceneSlides('writing', () => import('./scene'))])],
  }),
  { assets: import.meta.env.PROD ? './manim-handout.json' : undefined },
);
await new Reveal(document.querySelector('.reveal') as HTMLElement, {
  hash: true,
  plugins: [plugin, RevealNotes],
}).initialize();
