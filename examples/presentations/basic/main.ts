import Reveal from 'reveal.js';
import RevealNotes from 'reveal.js/plugin/notes';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import {
  manimPresentation,
  presentation,
  topic,
  markdownSlide,
  sceneSlides,
} from 'manim-web/reveal';

const content = presentation({
  title: 'A first manim-web presentation',
  topics: [
    topic('welcome', [
      markdownSlide(
        'intro',
        '# A few ways to present an idea\n\nPlain slides, animated text, and geometry in motion.\n\nDown moves between pauses. Right changes topic.',
      ),
      markdownSlide(
        'bullets',
        '## A plain slide works, too\n\n- Start with one clear idea.\n- Use a short list to make it easy to follow.\n- Add motion when a change is worth seeing.\n\nEverything on this slide appears together.',
        { notes: 'An ordinary Markdown slide: no scene, fragments, or entrance animation.' },
      ),
    ]),
    topic('geometry', [sceneSlides('circle', () => import('./scene'))]),
    topic('text', [sceneSlides('styles', () => import('./text'))]),
    topic('coordinates', [sceneSlides('point', () => import('./coordinates'))]),
  ],
});

const plugin = manimPresentation(content, {
  assets: import.meta.env.PROD ? './manim-handout.json' : undefined,
});
const deck = new Reveal(document.querySelector('.reveal') as HTMLElement, {
  hash: true,
  plugins: [plugin, RevealNotes],
});
await deck.initialize();
