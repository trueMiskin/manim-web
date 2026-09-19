import { Create, FadeIn, LaggedStart } from '../../../../src';
import { defineSlide } from '../../../../src/reveal';
import { C, label, TECH_THEME } from './common';
import {
  changeField,
  fieldForeground,
  fieldState,
  heatmap,
  makeTable,
  opacity,
  smoothingStates,
  vectorField,
} from './numerical-common';

export default defineSlide(
  { title: 'Heatmaps and vector fields', theme: TECH_THEME, titleVisible: false },
  async (s) => {
    const table = makeTable();
    table.base.remove(table.rxLabel);
    let state = fieldState('002-coverage');
    let image = heatmap(state);
    const vectors = vectorField(state);
    const title = s.title;
    const caption = label('Coverage, gradients and smooth transitions', 22, C.muted, [0, -2.7, 0]);

    await s.step(
      {
        id: 'fields-coverage',
        title: 'Show a numerical field',
        notes:
          'A first-order coverage heatmap and its gradient arrows use the original numerical data.',
      },
      async () => {
        await s.play(new FadeIn(title), new FadeIn(caption), new FadeIn(table.base));
        image.opacity = 0;
        s.scene.add(image, vectors);
        fieldForeground(s.scene, table, vectors);
        await s.play(
          opacity(image, 0, 0.85, 1.2),
          new LaggedStart(
            vectors.children.map((arrow) => new Create(arrow, { duration: 0.25 })),
            { lagRatio: 0.02 },
          ),
        );
      },
    );
    await s.step(
      {
        id: 'fields-smoothing',
        title: 'Animate the field',
        notes:
          'Transition to the smooth first-order field and animate the original smoothing sequence.',
      },
      async () => {
        for (const [index, nextState] of smoothingStates.entries()) {
          const next = heatmap(nextState);
          await changeField(s.scene, image, next, vectors, state, nextState, index === 0 ? 1 : 0.1);
          image = next;
          state = nextState;
        }
      },
    );
  },
);
