import { ThreeDScene, Torus, Rotate } from 'manim-web';
import type { SceneDefinition } from 'manim-web/reveal';

export default {
  createScene: (container, options) =>
    new ThreeDScene(container, {
      ...options,
      enableOrbitControls: false,
      phi: Math.PI / 3,
      theta: -Math.PI / 4,
    }),
  async build(scene) {
    const torus = new Torus({ radius: 2, tubeRadius: 0.65, color: '#58c4dd' });
    scene.add(torus);
    await scene.step(
      {
        id: 'still',
        title: 'An illustrative 3D torus',
        notes: 'Procedural geometry; this is not an antenna model or radiation pattern.',
      },
      () => scene.wait(0.1),
    );
    await scene.step(
      { id: 'rotate', title: 'Deterministic rotation', loop: true, printTime: 1.1 },
      () => scene.play(new Rotate(torus, { angle: Math.PI * 2, axis: [1, 0, 0], duration: 4 })),
    );
  },
} satisfies SceneDefinition;
