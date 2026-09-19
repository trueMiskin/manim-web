import { Circle, Create, Text } from 'manim-web';
import type { SceneDefinition } from 'manim-web/reveal';
import { palettes } from './palettes';

// Direct scene construction: useful when an animation owns the whole frame.
// For ordinary presentation content, use defineSlide as in the other examples.
export default {
  async build(scene, context) {
    const colors = context?.colors ?? palettes.dark;
    const title = new Text({
      text: 'A manually arranged scene',
      fontSize: 42,
      color: colors.text,
    }).moveTo([0, 2.7, 0]);
    const circle = new Circle({ radius: 1.3, color: colors.accent, fillOpacity: 0.3 });
    scene.add(title);
    await scene.step(
      { id: 'draw', notes: 'Objects are positioned explicitly in scene units.' },
      () => scene.play(new Create(circle)),
    );
    await scene.step({ id: 'move' }, () => scene.play(circle.animate.shift([2, 0, 0])));
  },
} satisfies SceneDefinition;
