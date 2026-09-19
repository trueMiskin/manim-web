import { ThreeDScene, FadeIn, Rotate, UpdateFromAlphaFunc, linear } from '../../../../src';
import type { SceneDefinition } from '../../../../src/reveal';
import { heading, label } from './common';
import { techDemoPalettes } from '../palettes';
import { DeformingSurface } from './surface-deformation';

export default {
  createScene: (container, options) =>
    new ThreeDScene(container, {
      ...options,
      enableOrbitControls: false,
      phi: Math.PI / 3,
      theta: -Math.PI / 3,
      distance: 10,
    }),
  async build(scene, { colors } = { colors: techDemoPalettes.dark }) {
    const surface = new DeformingSurface(colors);
    const title = heading('Deforming surfaces', colors.text);
    const caption = label(
      'A flat grid becomes a travelling wave, then a saddle',
      22,
      colors.muted,
      [0, -3.2, 0],
    );
    (scene.scene as ThreeDScene).addFixedInFrameMobjects(title, caption);
    await scene.step(
      {
        id: '3d-object',
        title: 'A shaded parametric grid',
        notes:
          'A flat parametric surface shows its grid in an oblique view. The labels stay fixed to the screen.',
      },
      () => scene.play(new FadeIn(surface), new FadeIn(title), new FadeIn(caption)),
    );
    await scene.step(
      {
        id: '3d-rotation',
        title: 'A travelling wave becomes a saddle',
        notes:
          'The grid rises into a ripple and turns while the wave travels across it, then the same mesh deforms into a saddle.',
      },
      async () => {
        await scene.play(
          new UpdateFromAlphaFunc(surface, (_, alpha) => surface.setDeformation(alpha, 0), {
            duration: 1.6,
          }),
        );
        await scene.play(
          new UpdateFromAlphaFunc(
            surface,
            (_, alpha) => surface.setDeformation(1, 2 * Math.PI * alpha),
            { duration: 2.4, rateFunc: linear },
          ),
          new Rotate(surface, {
            angle: 0.5,
            axis: [0, 0, 1],
            duration: 2.4,
            rateFunc: linear,
          }),
        );
        await scene.play(
          new UpdateFromAlphaFunc(
            surface,
            (_, alpha) => surface.setDeformation(1 + alpha, 2 * Math.PI),
            { duration: 1.6 },
          ),
        );
      },
    );
  },
} satisfies SceneDefinition;
