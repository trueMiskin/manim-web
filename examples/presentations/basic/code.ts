import { code, columns, paragraph, slide } from 'manim-web/reveal';

export default slide('function', {
  title: 'Present code beside its explanation',
  content: columns([
    code(
      `int twice(int value) {
    return value * 2;
}

int result = twice(3);`,
      { language: 'cpp', lineNumbers: true, copyButton: true },
    ),
    [
      paragraph('A small function doubles its input.'),
      paragraph('The result is 6.', { id: 'answer', color: 'accent' }),
    ],
  ]),
  notes: 'Ask the audience to predict the result. Select the code or use its Copy button.',
  builds: [{ id: 'answer', show: ['answer'] }],
});
