import {
  Axes,
  Dot,
  LEFT,
  Line,
  ParametricFunction,
  Text,
  ValueTracker,
  lengthVec,
  linear,
  type Vector3Tuple,
} from 'manim-web';
import { defineSlide } from 'manim-web/reveal';

const pointAt = (angle: number): Vector3Tuple => [2.1 * Math.cos(angle), 1.35 * Math.sin(angle), 0];

// Fixed-width signed numbers keep the labels steady as the point crosses axes.
function signed(value: number, decimals: number, width: number): string {
  const number = value.toFixed(decimals);
  return `${number.startsWith('-') ? '' : '+'}${number}`.padStart(width);
}

export default defineSlide({ title: 'A point moves. The numbers follow.' }, async (s) => {
  const { accent, secondary, muted } = s.theme.colors;
  const [plot, values] = s.columns([3, 2]);
  const axes = plot.place(
    new Axes({
      xRange: [-3, 3, 1],
      yRange: [-2, 2, 1],
      xLength: 6,
      yLength: 4,
      color: muted,
      tips: false,
      axisConfig: { includeTicks: true, includeNumbers: false },
    }),
    { height: 4.5, fit: 'none' },
  );
  const theta = new ValueTracker(0.45);
  const coordinates = () => pointAt(theta.getValue());
  const readouts = [
    { text: () => `x = ${signed(coordinates()[0], 2, 5)}`, color: accent },
    { text: () => `y = ${signed(coordinates()[1], 2, 5)}`, color: accent },
    { text: () => `distance = ${lengthVec(coordinates()).toFixed(2)}`, color: secondary },
    {
      text: () => {
        const [x, y] = coordinates();
        return `angle = ${signed((Math.atan2(y, x) * 180) / Math.PI, 1, 6)}°`;
      },
      color: secondary,
    },
  ].map(({ text, color }) => ({
    text,
    label: values.place(new Text({ text: text(), fontSize: 28, fontFamily: 'monospace', color }), {
      align: 'left',
      fit: 'none',
    }),
  }));
  const caption = s.paragraph('Distance from the origin · angle from the x-axis', {
    fontSize: 23,
    color: 'muted',
  });

  // Show the initial blocks so the diagram uses the axes' final column position.
  await s.show(axes, caption, ...readouts.map(({ label }) => label));
  const position = () => {
    const [x, y] = coordinates();
    return axes.c2p(x, y);
  };
  const origin = axes.c2p(0, 0);
  const grid = [
    ...[-3, -2, -1, 1, 2, 3].map(
      (x) => new Line({ start: axes.c2p(x, -2), end: axes.c2p(x, 2), color: '#293341' }),
    ),
    ...[-2, -1, 1, 2].map(
      (y) => new Line({ start: axes.c2p(-3, y), end: axes.c2p(3, y), color: '#293341' }),
    ),
  ];
  const curve = new ParametricFunction({
    func: pointAt,
    axes,
    tRange: [0, 2 * Math.PI],
    numSamples: 120,
    color: '#466277',
    strokeWidth: 2,
  });
  const radius = new Line({ start: origin, end: position(), color: secondary, strokeWidth: 3 });
  radius.addUpdater(() => radius.setEnd(position()));
  const point = new Dot({ point: position(), radius: 0.09, color: accent });
  point.addUpdater(() => point.moveTo(position()));
  const pointLabel = new Text({ text: 'P', fontSize: 24, color: accent });
  const updatePointLabel = () => pointLabel.moveTo(position()).shift([0.22, 0.25, 0]);
  updatePointLabel();
  pointLabel.addUpdater(updatePointLabel);
  const labels = [
    new Text({ text: 'x', fontSize: 22 }).moveTo(axes.c2p(3.3, 0)),
    new Text({ text: 'y', fontSize: 22 }).moveTo(axes.c2p(0, 2.3)),
    new Text({ text: '0', fontSize: 20, color: muted }).moveTo(origin).shift([-0.18, -0.23, 0]),
  ];
  for (const { label, text } of readouts) {
    const anchor = label.getLeft();
    label.addUpdater(() => {
      if (label.getText() !== text()) label.setText(text()).moveTo(anchor, LEFT);
    });
  }

  await s.step(
    {
      id: 'start',
      title: 'Coordinates at a glance',
      notes:
        'A point, its coordinates, distance from the origin, and signed angle from the positive x-axis.',
    },
    () => {
      s.scene.add(...grid, curve, theta, radius, point, pointLabel, ...labels);
    },
  );
  await s.step(
    {
      id: 'move',
      title: 'Move the point and update its values',
      notes:
        'The point and readouts follow the same ValueTracker on every frame. Pause or replay to inspect the changing values.',
    },
    () => s.play(theta.animateTo(4.2, { duration: 5, rateFunc: linear })),
  );
});
