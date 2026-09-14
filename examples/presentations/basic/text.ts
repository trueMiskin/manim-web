import {
  AddTextLetterByLetter,
  FadeIn,
  FadeOut,
  Indicate,
  LaggedStart,
  ReplacementTransform,
  Text,
  Write,
} from 'manim-web';
import type { SceneDefinition } from 'manim-web/reveal';

export default {
  async build(scene) {
    const heading = new Text({ text: 'Give words a little motion', fontSize: 44 }).shift([
      0, 2.35, 0,
    ]);
    const sentence = new Text({
      text: 'One letter. One word. One idea.',
      fontSize: 34,
      color: '#58c4dd',
    }).shift([0, 0.4, 0]);
    const caption = new Text({
      text: 'Write a heading · reveal letters · fade in a caption',
      fontSize: 23,
      color: '#b8c2d1',
    }).shift([0, -1.25, 0]);

    await scene.step(
      {
        id: 'reveal',
        title: 'Three ways to introduce text',
        notes:
          'Write reveals the heading; the sentence arrives letter by letter; the caption fades in.',
      },
      async () => {
        await scene.play(new Write(heading, { duration: 1 }));
        await scene.play(new AddTextLetterByLetter(sentence, { duration: 1.8 }));
        await scene.play(new FadeIn(caption, { duration: 0.7 }));
      },
    );

    const nextHeading = new Text({ text: 'Build a list, then add emphasis', fontSize: 44 }).shift([
      0, 2.35, 0,
    ]);
    const items = [
      '• Reveal one idea at a time.',
      '• Let each line settle before the next.',
      '• Highlight the point to remember.',
    ].map((text, index) =>
      new Text({ text, fontSize: 30, color: index === 2 ? '#58c4dd' : '#ffffff' }).moveTo([
        0,
        0.85 - index * 1.05,
        0,
      ]),
    );
    // Align the list by its left edge even though the lines have different lengths.
    items.forEach((item) => item.shift([-4 - item.getBounds().min.x, 0, 0]));

    await scene.step(
      {
        id: 'bullets',
        title: 'Staggered bullets and emphasis',
        notes:
          'The heading transforms, lines slide and fade in with staggered starts, and the last line is emphasized.',
      },
      async () => {
        await scene.play(
          new ReplacementTransform(heading, nextHeading),
          new FadeOut(sentence),
          new FadeOut(caption),
        );
        await scene.play(
          new LaggedStart(
            items.map((item) => new FadeIn(item, { shift: [0.4, 0, 0], duration: 0.7 })),
            { lagRatio: 0.65 },
          ),
        );
        await scene.play(new Indicate(items[2], { scaleFactor: 1.06, duration: 0.9 }));
      },
    );
  },
} satisfies SceneDefinition;
