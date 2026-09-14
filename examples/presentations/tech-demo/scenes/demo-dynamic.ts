import { Create, FadeIn, Star, UpdateFromAlphaFunc, linear } from '../../../../src';
import type { SceneDefinition } from '../../../../src/reveal/types';
import { addVec } from '../../../../src/utils/vectors';
import { C, heading, label } from './common';
import { INITIAL_RX, INITIAL_TX, reflectionPath } from './billiard-geometry';
import { billiardTable } from './billiard-table';

export default {
  options: { backgroundColor: C.bg },
  async build(scene) {
    const table = billiardTable([0, 0.25, 0], 1.15);
    const initial = reflectionPath(INITIAL_TX, ['bottom']);
    const ray = table.path(initial.points, C.green, 3.5);
    const receiver = table.marker(INITIAL_RX, C.cyan).setFill(C.cyan, 1);
    const bounce = new Star({
      numPoints: 5,
      outerRadius: 0.15,
      innerRadius: 0.07,
      color: C.amber,
      fillOpacity: 1,
    }).moveTo(table.project(initial.bounces[0]));

    await scene.step(
      {
        id: 'dynamic-path',
        title: 'A path with linked geometry',
        notes: 'The receiver, bounce point and reflected path share one geometric construction.',
      },
      async () => {
        await scene.play(
          new FadeIn(heading('Live geometry updates')),
          new FadeIn(label('Move the receiver; the bounce follows', 22, C.muted, [0, -2.8, 0])),
          new FadeIn(table.objects),
        );
        await scene.play(new Create(ray), new FadeIn(receiver), new FadeIn(bounce));
      },
    );
    await scene.step(
      {
        id: 'dynamic-motion',
        title: 'Update a moving path',
        notes:
          'One updater moves the receiver left and recomputes the bounce point and both ray segments every frame.',
      },
      () =>
        scene.play(
          new UpdateFromAlphaFunc(
            ray,
            (_, alpha) => {
              const rx = addVec(INITIAL_RX, [-1.5 * alpha, 0, 0]);
              const current = reflectionPath(INITIAL_TX, ['bottom'], rx);
              ray.setPointsAsCorners(current.points.map(table.project));
              bounce.moveTo(table.project(current.bounces[0]));
              receiver.moveTo(table.project(rx));
              table.rxLabel.moveTo(addVec(table.project(rx), [-0.03, -0.28, 0]));
            },
            { duration: 2.5, rateFunc: linear },
          ),
        ),
    );
  },
} satisfies SceneDefinition;
