import { Circle, Create, Text } from 'manim-web';
import type { SceneDefinition } from 'manim-web/reveal';

// Direct scene construction: useful when an animation owns the whole frame.
// For ordinary presentation content, use defineSlide as in the other examples.
export default {
  async build(scene) {
    const title = new Text({ text: 'A manually arranged scene', fontSize: 42 }).moveTo([0, 2.7, 0]);
    const circle = new Circle({ radius: 1.3, color: '#58c4dd', fillOpacity: 0.3 });
    scene.add(title);
    await scene.step(
      { id: 'draw', notes: 'Objects are positioned explicitly in scene units.' },
      () => scene.play(new Create(circle)),
    );
    await scene.step({ id: 'move' }, () => scene.play(circle.animate.shift([2, 0, 0])));
  },
} satisfies SceneDefinition;
