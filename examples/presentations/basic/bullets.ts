import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'A plain slide works, too' }, async (s) => {
  const points = s.bullets([
    'Start with one clear idea.',
    'Use a short list to make it easy to follow.',
    'Add motion when a change is worth seeing.',
  ]);
  const caption = s.paragraph('Everything on this slide appears together.', { color: 'muted' });
  await s.step(
    { id: 'content', notes: 'Static content uses the same layout as animated slides.' },
    () => s.show(points, caption),
  );
});
