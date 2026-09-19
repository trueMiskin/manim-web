import {
  Create,
  DashedLine,
  FadeIn,
  GrowFromCenter,
  MoveAlongPath,
  Star,
  TransformFromCopy,
  linear,
} from '../../../../src';
import { defineSlide } from '../../../../src/reveal';
import { addVec } from '../../../../src/utils/vectors';
import { TECH_THEME, label } from './common';
import { INITIAL_RX, INITIAL_TX, reflectionPath } from './billiard-geometry';
import { billiardTable } from './billiard-table';

export default defineSlide(
  { title: 'Geometry and paths', theme: TECH_THEME, titleVisible: false },
  async (s) => {
    const table = billiardTable(s.colors, [0, 0.5, 0], 1);
    const reflection = reflectionPath(INITIAL_TX, ['bottom']);
    const virtual = table.marker(reflection.images[1]);
    const virtualLabel = label(
      'TX′',
      18,
      s.colors.cyan,
      addVec(table.project(reflection.images[1]), [0, -0.27, 0]),
    );
    const construction = new DashedLine({
      start: table.project(INITIAL_RX),
      end: table.project(reflection.images[1]),
      color: s.colors.cyan,
      strokeWidth: 2.5,
    });
    const bounce = new Star({
      numPoints: 5,
      outerRadius: 0.15,
      innerRadius: 0.07,
      color: s.colors.amber,
      fillOpacity: 1,
    }).moveTo(table.project(reflection.bounces[0]));
    const ray = table.path(reflection.points, s.colors.green, 3.5);

    await s.step(
      {
        id: 'reflections-construction',
        title: 'Construct a reflected path',
        notes:
          'Mirror the transmitter and connect the virtual point to the receiver to locate the bounce.',
      },
      async () => {
        await s.play(
          new FadeIn(s.title),
          new FadeIn(
            label('Mirror a point, construct a path, follow it', 22, s.colors.muted, [0, -3.2, 0]),
          ),
          new FadeIn(table.objects),
        );
        await s.play(new TransformFromCopy(table.cue, virtual), new FadeIn(virtualLabel));
        await s.play(new Create(construction), new GrowFromCenter(bounce), new Create(ray));
      },
    );
    await s.step(
      {
        id: 'reflections-motion',
        title: 'Move along the path',
        notes: 'The cue ball follows the complete two-segment reflected path at a constant speed.',
      },
      async () => {
        await s.play(construction.animate.setStyle({ strokeOpacity: 0.2 }).withDuration(0.3));
        s.scene.scene.addForegroundMobject(table.cue);
        await s.play(new MoveAlongPath(table.cue, { path: ray, duration: 2, rateFunc: linear }));
      },
    );
  },
);
