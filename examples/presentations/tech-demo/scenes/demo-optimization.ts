import { Dot, FadeIn, Group, UpdateFromAlphaFunc, VMobject, linear } from '../../../../src';
import { defineSlide } from '../../../../src/reveal';
import optimization from '../data/optimization.json';
import { C, label, TECH_THEME } from './common';
import {
  changeField,
  fieldForeground,
  fieldState,
  heatmap,
  makeTable,
  point,
  text,
  vectorField,
} from './numerical-common';

export default defineSlide(
  { title: 'Data-driven animation', theme: TECH_THEME, titleVisible: false },
  async (s) => {
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

    await s.step(
      {
        id: 'optimization-start',
        title: 'Visualize an optimization',
        notes: 'The transmitter starts in the original smoothed field with two fixed receivers.',
      },
      async () => {
        await s.play(
          new FadeIn(s.title),
          new FadeIn(
            label('One trajectory drives the marker, trail and field', 22, C.muted, [0, -2.7, 0]),
          ),
          new FadeIn(table.base),
        );
        await s.play(
          new FadeIn(image),
          new FadeIn(vectors),
          ...receivers.map((receiver) => new FadeIn(receiver)),
        );
        fieldForeground(s.scene, table, vectors, receivers);
      },
    );
    await s.step(
      {
        id: 'optimization-motion',
        title: 'Follow the complete trajectory',
        notes:
          'All 100 original optimization updates animate the transmitter, its trail, the heatmap and gradient arrows together.',
      },
      async () => {
        s.scene.add(trace);
        s.scene.scene.addForegroundMobject(
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
          await changeField(s.scene, image, next, vectors, state, nextState, 0.1, [
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
);
