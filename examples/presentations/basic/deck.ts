import {
  bullets,
  columns,
  image,
  math,
  paragraph,
  presentation,
  sceneSlides,
  slide,
  topic,
} from 'manim-web/reveal';
import intro from './intro';
import plainBullets from './bullets';
import { palettes } from './palettes';
import parabola from './parabola.svg?url';

export const deck = presentation({
  title: 'A first manim-web presentation',
  theme: { titleAlign: 'center', bodySize: 28 },
  palettes,
  palette: 'dark',
  topics: [
    topic('welcome', [intro, plainBullets]),
    topic('geometry', [sceneSlides('circle', () => import('./scene'))]),
    topic('text', [sceneSlides('styles', () => import('./text'))]),
    topic('coordinates', [sceneSlides('point', () => import('./coordinates'))]),
    topic('matrices', [sceneSlides('product', () => import('./matrix'))]),
    topic('lesson', [
      slide('quadratic', {
        title: 'Meet a quadratic function',
        content: [
          paragraph('Squaring a number gives a simple function to explore.'),
          math('f(x)=x^2'),
          bullets([
            'Positive and negative inputs can give the same result.',
            'The minimum is at zero.',
          ]),
        ],
        notes: 'Ask the audience what happens when the input changes sign.',
      }),
      slide('graph', {
        title: 'See the same idea on a graph',
        content: columns(
          [
            [
              paragraph('The curve is symmetric about the vertical axis.'),
              math('f(-2)=f(2)=4', { fontSize: 34, color: 'accent' }),
            ],
            [
              image(parabola, {
                caption: 'On the parabola, inputs −2 and 2 both give a height of 4.',
                height: 3,
              }),
            ],
          ],
          { widths: [3, 2] },
        ),
      }),
      slide('closer', {
        title: 'Move closer to the minimum',
        content: [
          paragraph('Start at two, then move toward zero one step at a time.'),
          math('f(2)=4'),
          bullets([
            { id: 'closer', text: 'At $x=1$, the output falls to $f(1)=1$.' },
            { id: 'minimum', text: 'At $x=0$, the output reaches its minimum: $f(0)=0$.' },
          ]),
        ],
        notes: 'Ask what the output will be when the input is one.',
        builds: [
          {
            id: 'first-step',
            show: ['closer'],
            notes: 'Moving from two to one brings both the input and its square closer to zero.',
          },
          {
            id: 'minimum',
            show: ['minimum'],
            notes: 'At zero, the square reaches its smallest possible value.',
          },
        ],
      }),
    ]),
  ],
});
