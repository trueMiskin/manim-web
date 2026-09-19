import { ThreeDScene, Torus, Rotate } from 'manim-web';
import { defineSlide } from 'manim-web/reveal';

export default defineSlide(
  {
    title: 'An illustrative 3D torus',
    createScene: (container, options) =>
      new ThreeDScene(container, {
        ...options,
        enableOrbitControls: false,
        phi: Math.PI / 3,
        theta: -Math.PI / 4,
      }),
  },
  async (slide) => {
    const caption = slide.paragraph('Procedural geometry, viewed from a fixed camera.', {
      color: 'muted',
    });
    const torus = new Torus({ radius: 2, tubeRadius: 0.65, color: slide.colors.accent });
    await slide.step(
      {
        id: 'still',
        title: 'An illustrative 3D torus',
        notes: 'Procedural geometry; this is not an antenna model or radiation pattern.',
      },
      async () => {
        // Keep the laid-out text in screen space; the torus uses the 3D camera.
        const scene = slide.scene.scene as ThreeDScene;
        scene.addFixedInFrameMobjects(...scene.mobjects);
        await slide.show(caption);
        slide.scene.add(torus);
        await slide.scene.wait(0.1);
      },
    );
    await slide.step(
      { id: 'rotate', title: 'Deterministic rotation', loop: true, printTime: 1.1 },
      () => slide.play(new Rotate(torus, { angle: Math.PI * 2, axis: [1, 0, 0], duration: 4 })),
    );
  },
);
