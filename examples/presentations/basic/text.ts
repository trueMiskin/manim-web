import {
  AddTextLetterByLetter,
  FadeIn,
  FadeOut,
  Indicate,
  LaggedStart,
  LEFT,
  ReplacementTransform,
  Text,
} from 'manim-web';
import { defineSlide } from 'manim-web/reveal';

export default defineSlide(
  { title: 'Give words a little motion', titleVisible: false },
  async (s) => {
    // Text keeps the heading morph; the slide supplies its style and alignment.
    const heading = new Text({
      text: s.title.getText(),
      fontSize: s.theme.titleSize,
      fontFamily: s.theme.fontFamily,
      fontWeight: 'bold',
      color: s.theme.colors.text,
    });
    const sentence = new Text({
      text: 'One letter. One word. One idea.',
      fontSize: 34,
      fontFamily: s.theme.fontFamily,
      color: s.theme.colors.accent,
    }).moveTo([0, 0.4, 0]);
    const caption = new Text({
      text: 'Write a heading · reveal letters · fade in a caption',
      fontSize: 23,
      fontFamily: s.theme.fontFamily,
      color: s.theme.colors.muted,
    }).moveTo([0, -1.25, 0]);
    const points = s.bullets([
      'Reveal one idea at a time.',
      'Let each line settle before the next.',
      'Highlight the point to remember.',
    ]);
    points.item(2).setColor(s.theme.colors.accent);

    await s.step(
      {
        id: 'reveal',
        title: 'Three ways to introduce text',
        notes:
          'Write reveals the heading; the sentence arrives letter by letter; the caption fades in.',
      },
      async () => {
        heading.moveTo(s.title.getLeft(), LEFT);
        await s.write(heading, { duration: 1 });
        await s.play(new AddTextLetterByLetter(sentence, { duration: 1.8 }));
        await s.play(new FadeIn(caption, { duration: 0.7 }));
      },
    );
    const nextHeading = heading.copy().setText('Build a list, then add emphasis');
    nextHeading.moveTo(heading.getLeft(), LEFT);
    await s.step(
      {
        id: 'bullets',
        title: 'Staggered bullets and emphasis',
        notes:
          'The heading transforms, lines slide and fade in with staggered starts, and the last line is emphasized.',
      },
      async () => {
        await s.play(
          new ReplacementTransform(heading, nextHeading),
          new FadeOut(sentence),
          new FadeOut(caption),
        );
        await s.play(
          new LaggedStart(
            points.items.map((item) => new FadeIn(item, { shift: [0.4, 0, 0], duration: 0.7 })),
            { lagRatio: 0.65 },
          ),
        );
        await s.play(new Indicate(points.item(2), { scaleFactor: 1.06, duration: 0.9 }));
      },
    );
  },
);
