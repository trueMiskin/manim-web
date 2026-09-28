import { bullets, paragraph, slide } from 'manim-web/reveal';

export default slide('bullets', {
  title: 'A plain slide works, too',
  content: [
    bullets([
      'Start with one clear idea.',
      'Use a short list to make it easy to follow.',
      'Add motion when a change is worth seeing.',
    ]),
    paragraph('Everything on this slide appears together.', { color: 'muted' }),
  ],
  notes: 'Static content uses the same layout as animated slides.',
});
