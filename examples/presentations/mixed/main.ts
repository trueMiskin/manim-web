import Reveal from 'reveal.js';
import RevealNotes from 'reveal.js/plugin/notes';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import {
  manimPresentation,
  presentation,
  topic,
  htmlSlide,
  markdownSlide,
  imageSlide,
  videoSlide,
  audioSlide,
  blankSlide,
  sceneSlides,
} from 'manim-web/reveal';
import { palettes } from './palettes';
import diagram from './diagram.svg?url';
import clip from './demo.webm?url';
import tone from './tone.wav?url';
import poster from './video-poster.svg?url';

const plugin = manimPresentation(
  presentation({
    title: 'Mixed presentation content',
    palettes,
    palette: 'dark',
    topics: [
      topic('static', [
        markdownSlide(
          'intro',
          '# One deck, several media\n\nHTML, Markdown, SVG, backgrounds and live 3D share navigation and printing.',
        ),
        imageSlide('diagram', diagram, {
          alt: 'A cyan circle connected to a yellow square',
          caption: 'An ordinary SVG asset',
        }),
        htmlSlide(
          'discussion',
          '<h2>A question for the room</h2><p>Which representation makes the idea clearest?</p>',
        ),
        blankSlide('pause', {
          notes: 'A deliberate background-only pause.',
        }),
      ]),
      topic('media', [
        videoSlide('motion', clip, {
          poster,
          caption: 'A generated circle animation',
          muted: true,
        }),
        audioSlide('tone', tone, {
          caption: 'A quiet 440 Hz tone',
          printContent: '<h2>Audio example</h2><p>A short, generated 440 Hz tone.</p>',
        }),
      ]),
      topic('three-d', [sceneSlides('torus', () => import('./torus'))]),
    ],
  }),
  { assets: import.meta.env.PROD ? './manim-handout.json' : undefined },
);
await new Reveal(document.querySelector('.reveal') as HTMLElement, {
  hash: true,
  plugins: [plugin, RevealNotes],
}).initialize();
