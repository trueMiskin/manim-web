import { Text, Write, AddTextLetterByLetter, Indicate, FadeOut } from 'manim-web';
import type { SceneDefinition } from 'manim-web/reveal';

export default {
  async build(scene) {
    const heading = new Text({ text: 'Text stays text', fontSize: 50 }).shift([0, 1.8, 0]);
    const message = new Text({ text: 'Café  👩‍🔬\nWrite. Pause. Select. Print.', fontSize: 36 });
    await scene.step(
      {
        id: 'heading',
        title: 'Writing',
        notes: 'Texture text uses a reveal treatment. Supply fontUrl for vector outlines.',
      },
      async () => {
        await scene.play(new Write(heading));
      },
    );
    await scene.step({ id: 'graphemes', title: 'Unicode graphemes' }, async () => {
      await scene.play(new AddTextLetterByLetter(message, { duration: 2 }));
    });
    await scene.step({ id: 'emphasis', title: 'Emphasis and selection' }, async () => {
      await scene.play(new Indicate(heading));
    });
    await scene.step({ id: 'remove', title: 'Only visible text is selectable' }, async () => {
      await scene.play(new FadeOut(message));
    });
  },
} satisfies SceneDefinition;
