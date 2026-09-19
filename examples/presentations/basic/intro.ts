import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'A few ways to present an idea' }, async (s) => {
  const intro = s.paragraph('Plain slides, animated text, and geometry in motion.');
  const navigation = s.paragraph('Down moves between pauses. Right changes topic.', {
    color: 'muted',
  });
  await s.step({ id: 'content' }, () => s.show(intro, navigation));
});
