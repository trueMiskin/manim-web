import { Dot, FadeIn, Group, UpdateFromAlphaFunc, VMobject, linear } from '../../../../src';
import type { SceneDefinition } from '../../../../src/reveal/types';
import optimization from '../data/optimization.json';
import { C, heading, label } from './common';
import {
  changeField,
  fieldForeground,
  fieldState,
  heatmap,
  makeTable,
  point,
  tableCenter,
  text,
  vectorField,
} from './numerical-common';

export default {
  options: { backgroundColor: C.bg },
  async build(scene) {
    scene.camera.frame.shift(tableCenter);
    const table = makeTable();
    table.base.remove(table.rxLabel);
    table.tx.moveTo(point([...optimization.initialTx, 0.12]));
    table.txLabel.moveTo(point([...optimization.initialTx, 0.14]));
    const receivers = optimization.receivers.map(
      (location, index) =>
        new Group(
          new Dot({ point: point(location), color: '#000000', radius: 0.1 }),
          text(`RX ${index + 1}`, point([location[0] + 0.35, location[1], 0.12]), 12),
        ),
    );
    let state = fieldState(optimization.initialStateId);
    let image = heatmap(state);
    const vectors = vectorField(state);
    const trace = new VMobject().setColor(C.green).setStrokeWidth(4).setFillOpacity(0);

    await scene.step(
      {
        id: 'optimization-start',
        title: 'Visualize an optimization',
        notes: 'The transmitter starts in the original smoothed field with two fixed receivers.',
      },
      async () => {
        await scene.play(
          new FadeIn(heading('Data-driven animation').shift(tableCenter)),
          new FadeIn(
            label('One trajectory drives the marker, trail and field', 22, C.muted, [
              tableCenter[0],
              -2.7,
              0,
            ]),
          ),
          new FadeIn(table.base),
        );
        await scene.play(
          new FadeIn(image),
          new FadeIn(vectors),
          ...receivers.map((receiver) => new FadeIn(receiver)),
        );
        fieldForeground(scene, table, vectors, receivers);
      },
    );
    await scene.step(
      {
        id: 'optimization-motion',
        title: 'Follow the complete trajectory',
        notes:
          'All 100 original optimization updates animate the transmitter, its trail, the heatmap and gradient arrows together.',
      },
      async () => {
        scene.add(trace);
        scene.scene.addForegroundMobject(
          trace,
          table.tx,
          table.txLabel,
          ...table.pockets,
          ...receivers,
        );
        for (const [index, step] of optimization.steps.entries()) {
          const nextState = fieldState(step.stateId);
          const next = heatmap(nextState);
          const from = index ? optimization.steps[index - 1].tx : optimization.initialTx;
          const earlier = [
            optimization.initialTx,
            ...optimization.steps.slice(0, index).map((value) => value.tx),
          ];
          const updateTrace = new UpdateFromAlphaFunc(
            trace,
            (_, progress) => {
              const current = from.map((value, axis) => value + (step.tx[axis] - value) * progress);
              trace.setPointsAsCorners(
                [...earlier, current].map((location) => point([...location, 0.11])),
              );
            },
            { duration: 0.1, rateFunc: linear },
          );
          await changeField(scene, image, next, vectors, state, nextState, 0.1, [
            table.tx.animate
              .moveTo(point([...step.tx, 0.12]))
              .withDuration(0.1)
              .withRateFunc(linear),
            table.txLabel.animate
              .moveTo(point([...step.tx, 0.14]))
              .withDuration(0.1)
              .withRateFunc(linear),
            updateTrace,
          ]);
          image = next;
          state = nextState;
        }
      },
    );
  },
} satisfies SceneDefinition;
