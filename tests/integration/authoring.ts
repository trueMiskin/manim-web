import Reveal from 'reveal.js';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import { Axes, Create, Dot, Group, Player, type Mobject } from 'manim-web';
import {
  defineSlide,
  manimPresentation,
  markdownSlide,
  presentation,
  sceneSlides,
  topic,
} from 'manim-web/reveal';

declare global {
  interface Window {
    __AUTHORING_OBJECTS__: Record<string, Mobject>;
    __AUTHORING_CHILD_REVEAL__: { axes: boolean; point: boolean; diagram: boolean };
    __AUTHORING_OVERFLOW__: () => Promise<string>;
  }
}

const lesson = defineSlide({ title: 'Gradient descent' }, async (s) => {
  const [content, figure] = s.columns([3, 2]);
  const intro = content.paragraph(
    String.raw`Choose a step size $\eta < 1$ and move steadily toward the minimum while preserving room for a diagram.`,
  );
  const rule = content.math([
    { key: 'next', latex: 'x_{k+1}', color: '#58c4dd' },
    '=',
    { key: 'current', latex: String.raw`x_k - \eta \nabla f(x_k)` },
  ]);
  const points = content.bullets([
    String.raw`First, follow the negative gradient $-\nabla f(x)$ to move toward the nearest local minimum.`,
    'Second, repeat until the changes are small.',
  ]);
  const axes = new Axes({
    xRange: [-2, 2, 1],
    yRange: [-1, 1, 1],
    xLength: 4,
    yLength: 2,
    tips: false,
  });
  const point = new Dot({ point: axes.coordsToPoint(1, 0.5), color: '#58c4dd' });
  const diagram = figure.place(new Group(axes, point), { height: 2.5 });
  window.__AUTHORING_OBJECTS__ = {
    intro,
    rule,
    first: points.item(0),
    second: points.item(1),
    diagram,
  };

  await s.step({ id: 'title' }, () => {});
  await s.step({ id: 'rule' }, async () => {
    await s.reveal(intro);
    await s.write(rule);
  });
  await s.step({ id: 'first' }, () => s.reveal(points.item(0)));
  await s.step({ id: 'second' }, () => s.reveal(points.item(1)));
  await s.step({ id: 'diagram' }, async () => {
    await s.play(new Create(axes, { duration: 0.2 }));
    window.__AUTHORING_CHILD_REVEAL__ = {
      axes: axes.getThreeObject().visible,
      point: point.getThreeObject().visible,
      diagram: diagram.getThreeObject().visible,
    };
    await s.reveal(point);
  });
});

window.__AUTHORING_OVERFLOW__ = async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const player = new Player(container, { ui: false, keyboard: false, pointer: false });
  try {
    const tooTall = defineSlide({ title: 'Too much content' }, async (s) => {
      const paragraph = s.paragraph('A line of content.\n'.repeat(30));
      await s.step({ id: 'show' }, () => s.reveal(paragraph));
    });
    await player.sequence(tooTall.build);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    player.dispose();
    container.remove();
  }
};

const content = presentation({
  title: 'Authoring fixture',
  topics: [
    topic('lesson', [sceneSlides('gradient', async () => lesson)]),
    topic('reference', [
      markdownSlide(
        'math',
        '# A static reference\n\nChoose $\\eta > 0$.\n\n$$x_{k+1} = x_k - \\eta \\nabla f(x_k)$$\n\nUse `$x$` to explain the syntax.',
      ),
    ]),
  ],
});

const deck = new Reveal(document.querySelector('.reveal') as HTMLElement, {
  hash: true,
  transition: 'none',
  plugins: [manimPresentation(content)],
});
await deck.initialize();
