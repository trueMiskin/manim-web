import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'Gradient descent' }, async (s) => {
  const intro = s.paragraph('To reduce a function $f$, move against its slope.');
  const rule = s.math(String.raw`x_{k+1}=x_k-\eta f'(x_k)`);
  const points = s.bullets([
    String.raw`Choose a step size $\eta > 0$.`,
    'Repeat until the changes become small.',
  ]);

  await s.step(
    { id: 'rule', notes: 'The derivative tells us which direction increases the function.' },
    async () => {
      await s.reveal(intro);
      await s.write(rule);
    },
  );
  await s.step(
    { id: 'step-size', notes: 'The step size controls how far each update moves.' },
    () => s.reveal(points.item(0)),
  );
  await s.step({ id: 'repeat', notes: 'Apply the same update again at the new position.' }, () =>
    s.reveal(points.item(1)),
  );
});
