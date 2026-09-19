import Reveal from 'reveal.js';
import Notes from 'reveal.js/plugin/notes';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import { manimPresentation } from 'manim-web/reveal';
import { techDemo } from './deck';

const query = new URLSearchParams(location.search);
const content = techDemo({
  topics: import.meta.env.DEV && query.has('chapter') ? [query.get('chapter')!] : undefined,
});
const plugin = manimPresentation(content, {
  assets: import.meta.env.PROD ? './manim-handout.json' : undefined,
});
const deck = new Reveal(document.querySelector('.reveal') as HTMLElement, {
  hash: true,
  plugins: [Notes, plugin],
});
await deck.initialize({ transition: 'none', backgroundTransition: 'none' });
