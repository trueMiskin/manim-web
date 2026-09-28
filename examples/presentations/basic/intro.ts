import { paragraph, slide } from 'manim-web/reveal';

export default slide('intro', {
  title: 'A few ways to present an idea',
  content: [
    paragraph('Plain slides, animated text, and geometry in motion.'),
    paragraph('Down moves between pauses. Right changes topic.', { color: 'muted' }),
  ],
});
