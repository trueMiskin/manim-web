import { Circle, Create, Text, Write } from 'manim-web';
import type { SceneDefinition } from 'manim-web/reveal';

export default {
  async build(scene) {
    const title = new Text({ text: 'A circle, then a shift', fontSize: 42 }).shift([0, 2.4, 0]);
    const circle = new Circle({ radius: 1.3, color: '#58c4dd', fillOpacity: 0.3 });
    await scene.step(
      { id: 'draw', title: 'Draw the circle', notes: 'Start with one geometric object.' },
      async () => {
        await scene.play(new Write(title), new Create(circle));
      },
    );
    await scene.step(
      {
        id: 'move',
        title: 'Move the circle',
        notes: 'The same object moves without rebuilding the slide.',
      },
      async () => {
        await scene.play(circle.animate.shift([2, 0, 0]));
      },
    );
  },
} satisfies SceneDefinition;
