import { Circle, Create } from 'manim-web';
import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'A circle, then a shift' }, async (s) => {
  const circle = s.place(new Circle({ radius: 1.3, color: s.colors.accent, fillOpacity: 0.3 }), {
    height: 4,
  });

  await s.step(
    { id: 'draw', title: 'Draw the circle', notes: 'Start with one geometric object.' },
    () => s.play(new Create(circle)),
  );
  await s.step(
    {
      id: 'move',
      title: 'Move the circle',
      notes: 'The same object moves without rebuilding the slide.',
    },
    () => s.play(circle.animate.shift([2, 0, 0])),
  );
});
