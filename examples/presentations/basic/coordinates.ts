import {
  Axes,
  Dot,
  Line,
  ParametricFunction,
  Text,
  ValueTracker,
  lengthVec,
  linear,
  type Vector3Tuple,
} from 'manim-web';
import type { SceneDefinition } from 'manim-web/reveal';

const pointAt = (angle: number): Vector3Tuple => [2.1 * Math.cos(angle), 1.35 * Math.sin(angle), 0];

// Fixed-width signed numbers keep the labels and their canvas textures steady
// as the point crosses axes or the angle passes 100 degrees.
function signed(value: number, decimals: number, width: number): string {
  const number = value.toFixed(decimals);
  return `${number.startsWith('-') ? '' : '+'}${number}`.padStart(width);
}

export default {
  async build(scene) {
    const heading = new Text({ text: 'A point moves. The numbers follow.', fontSize: 42 }).shift([
      0, 3, 0,
    ]);
    const axes = new Axes({
      xRange: [-3, 3, 1],
      yRange: [-2, 2, 1],
      xLength: 6,
      yLength: 4,
      color: '#b8c2d1',
      tips: false,
      axisConfig: { includeTicks: true, includeNumbers: false },
    }).shift([-1.7, -0.25, 0]);
    const grid = [
      ...[-3, -2, -1, 1, 2, 3].map(
        (x) => new Line({ start: axes.c2p(x, -2), end: axes.c2p(x, 2), color: '#293341' }),
      ),
      ...[-2, -1, 1, 2].map(
        (y) => new Line({ start: axes.c2p(-3, y), end: axes.c2p(3, y), color: '#293341' }),
      ),
    ];
    const theta = new ValueTracker(0.45);
    const coordinates = () => pointAt(theta.getValue());
    const position = () => {
      const [x, y] = coordinates();
      return axes.c2p(x, y);
    };
    const origin = axes.c2p(0, 0);
    const curve = new ParametricFunction({
      func: pointAt,
      axes,
      tRange: [0, 2 * Math.PI],
      numSamples: 120,
      color: '#466277',
      strokeWidth: 2,
    });
    const radius = new Line({ start: origin, end: position(), color: '#f4cf6b', strokeWidth: 3 });
    radius.addUpdater(() => radius.setEnd(position()));
    const point = new Dot({ point: position(), radius: 0.09, color: '#58c4dd' });
    point.addUpdater(() => point.moveTo(position()));
    const pointLabel = new Text({ text: 'P', fontSize: 24, color: '#58c4dd' });
    const updatePointLabel = () => pointLabel.moveTo(position()).shift([0.22, 0.25, 0]);
    updatePointLabel();
    pointLabel.addUpdater(updatePointLabel);

    const readouts = [
      { text: () => `x = ${signed(coordinates()[0], 2, 5)}`, color: '#58c4dd' },
      { text: () => `y = ${signed(coordinates()[1], 2, 5)}`, color: '#58c4dd' },
      { text: () => `distance = ${lengthVec(coordinates()).toFixed(2)}`, color: '#f4cf6b' },
      {
        text: () => {
          const [x, y] = coordinates();
          return `angle = ${signed((Math.atan2(y, x) * 180) / Math.PI, 1, 6)}°`;
        },
        color: '#f4cf6b',
      },
    ].map(({ text, color }, index) => {
      const label = new Text({ text: text(), fontSize: 28, fontFamily: 'monospace', color });
      const align = () =>
        label.moveTo([0, 1.05 - index * 0.75, 0]).shift([2.1 - label.getBounds().min.x, 0, 0]);
      align();
      label.addUpdater(() => {
        const value = text();
        if (label.getText() !== value) {
          label.setText(value);
          align();
        }
      });
      return label;
    });
    const labels = [
      new Text({ text: 'x', fontSize: 22 }).moveTo(axes.c2p(3.3, 0)),
      new Text({ text: 'y', fontSize: 22 }).moveTo(axes.c2p(0, 2.3)),
      new Text({ text: '0', fontSize: 20, color: '#b8c2d1' })
        .moveTo(origin)
        .shift([-0.18, -0.23, 0]),
      new Text({
        text: 'Distance from the origin · angle from the x-axis',
        fontSize: 23,
        color: '#b8c2d1',
      }).shift([0, -2.9, 0]),
    ];

    await scene.step(
      {
        id: 'start',
        title: 'Coordinates at a glance',
        notes:
          'A static view of a point, its coordinates, distance from the origin, and signed angle from the positive x-axis.',
      },
      () => {
        scene.add(
          heading,
          ...grid,
          axes,
          curve,
          theta,
          radius,
          point,
          pointLabel,
          ...readouts,
          ...labels,
        );
      },
    );
    await scene.step(
      {
        id: 'move',
        title: 'Move the point and update its values',
        notes:
          'The point and readouts follow the same ValueTracker on every frame. Pause or replay to inspect the changing values.',
      },
      async () => {
        await scene.play(theta.animateTo(4.2, { duration: 5, rateFunc: linear }));
      },
    );
  },
} satisfies SceneDefinition;
