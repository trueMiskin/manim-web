import { Axes, Indicate, MathTex, TransformMatchingTex, VGroup } from 'manim-web';
import { defineSlide } from 'manim-web/reveal';

const accent = '#58c4dd';

export default defineSlide(
  { title: 'A quadratic example', theme: { titleAlign: 'left', colors: { accent } } },
  async (s) => {
    const [content, figure] = s.columns([3, 2]);
    const intro = content.paragraph("For $f(x)=x^2$, the derivative is $f'(x)=2x$.");
    const rule = content.math(
      [
        { key: 'next', latex: 'x_{k+1}' },
        '=',
        { key: 'update', latex: String.raw`x_k-\eta(2x_k)`, color: 'accent' },
      ],
      { fontSize: 34 },
    );
    const conclusion = content.paragraph(
      String.raw`With $0 < \eta < \frac{1}{2}$, each step moves toward $x=0$.`,
    );

    const axes = new Axes({
      xRange: [-2, 2, 1],
      yRange: [0, 4, 1],
      xLength: 4.3,
      yLength: 3.3,
      color: '#b8c2d1',
      tips: false,
    });
    const curve = axes.plot((x) => x * x, { color: accent, strokeWidth: 3 });
    // Keep the axes and curve together while the column positions the diagram.
    const diagram = figure.place(new VGroup(axes, curve), { height: 3.7 });

    await s.step(
      { id: 'function', notes: 'This parabola reaches its minimum at the origin.' },
      () => s.reveal(intro, diagram),
    );
    await s.step(
      { id: 'substitute', notes: 'Substitute the derivative into our update rule.' },
      async () => {
        await s.write(rule);
        await s.play(new Indicate(rule.part('update')));
      },
    );
    await s.step(
      {
        id: 'simplify',
        notes: 'A small positive step size multiplies x by a number between zero and one.',
      },
      async () => {
        const simplified = new MathTex({
          latex: [
            { key: 'next', latex: 'x_{k+1}' },
            '=',
            { key: 'update', latex: String.raw`(1-2\eta)x_k`, color: accent },
          ],
          fontSize: 34,
          color: rule.color,
        });
        await simplified.waitForRender();
        simplified.moveTo(rule.getCenter());
        await s.play(new TransformMatchingTex(rule, simplified));
        await s.reveal(conclusion);
      },
    );
  },
);
