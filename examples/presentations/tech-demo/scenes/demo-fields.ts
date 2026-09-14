import { Create, FadeIn, LaggedStart } from '../../../../src';
import type { SceneDefinition } from '../../../../src/reveal/types';
import { C, heading, label } from './common';
import {
  changeField,
  fieldForeground,
  fieldState,
  heatmap,
  makeTable,
  opacity,
  smoothingStates,
  tableCenter,
  vectorField,
} from './numerical-common';

export default {
  options: { backgroundColor: C.bg },
  async build(scene) {
    // Center the original numerical coordinate system without changing its data.
    scene.camera.frame.shift(tableCenter);
    const table = makeTable();
    table.base.remove(table.rxLabel);
    let state = fieldState('002-coverage');
    let image = heatmap(state);
    const vectors = vectorField(state);
    const title = heading('Heatmaps and vector fields').shift(tableCenter);
    const caption = label('Coverage, gradients and smooth transitions', 22, C.muted, [
      tableCenter[0],
      -2.7,
      0,
    ]);

    await scene.step(
      {
        id: 'fields-coverage',
        title: 'Show a numerical field',
        notes:
          'A first-order coverage heatmap and its gradient arrows use the original numerical data.',
      },
      async () => {
        await scene.play(new FadeIn(title), new FadeIn(caption), new FadeIn(table.base));
        image.opacity = 0;
        scene.add(image, vectors);
        fieldForeground(scene, table, vectors);
        await scene.play(
          opacity(image, 0, 0.85, 1.2),
          new LaggedStart(
            vectors.children.map((arrow) => new Create(arrow, { duration: 0.25 })),
            { lagRatio: 0.02 },
          ),
        );
      },
    );
    await scene.step(
      {
        id: 'fields-smoothing',
        title: 'Animate the field',
        notes:
          'Transition to the smooth first-order field and animate the original smoothing sequence.',
      },
      async () => {
        for (const [index, nextState] of smoothingStates.entries()) {
          const next = heatmap(nextState);
          await changeField(scene, image, next, vectors, state, nextState, index === 0 ? 1 : 0.1);
          image = next;
          state = nextState;
        }
      },
    );
  },
} satisfies SceneDefinition;
