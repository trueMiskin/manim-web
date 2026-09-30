import { Circle, Create } from 'manim-web';
import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'An independently loaded animation' }, async (s) => {
  const circle = s.place(new Circle({ radius: 1, color: s.colors.accent }), { height: 3 });
  await s.step({ id: 'draw', title: 'Draw a circle' }, () =>
    s.play(new Create(circle, { duration: 0.01 })),
  );
  await s.step({ id: 'move', title: 'Move the circle' }, () =>
    s.play(circle.animate.shift([1, 0, 0]).withDuration(0.01)),
  );
});
