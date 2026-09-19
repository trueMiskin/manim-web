import {
  Create,
  Dot,
  FadeIn,
  FadeOut,
  MoveAlongPath,
  ReplacementTransform,
  linear,
  type Vector3Tuple,
} from '../../../../src';
import type { SceneDefinition } from '../../../../src/reveal/types';
import { subVec } from '../../../../src/utils/vectors';
import { C, heading, label } from './common';
import { lensRays, makeConcertHall, makeLens, polyline, traceHallRay } from './optics-geometry';

/** Continue the room's two-hit construction through four reflections. */
function bouncingRay(origin: Vector3Tuple, angle: number): Vector3Tuple[] {
  const points = traceHallRay(origin, angle);
  while (points.length < 6) {
    const previous = points[points.length - 2];
    const incoming = subVec(points[points.length - 1], previous);
    const continuation = traceHallRay(previous, Math.atan2(incoming[1], incoming[0]));
    points.push(continuation[2]);
  }
  return points;
}

export default {
  options: { backgroundColor: C.bg },
  async build(scene) {
    const title = heading('Shape morphing');
    const caption = label('A lens becomes a room; light keeps bouncing', 22, C.muted, [0, -2.8, 0]);
    const convex = makeLens('convex');
    const convexRays = lensRays('convex');

    await scene.step(
      {
        id: 'optics-convex',
        title: 'Create a lens and its rays',
        notes: 'Vector geometry and seven ray paths appear together.',
      },
      () =>
        scene.play(
          new FadeIn(title),
          new FadeIn(caption),
          new Create(convex),
          new Create(convexRays),
        ),
    );
    const concave = makeLens('concave');
    const concaveRays = lensRays('concave');
    await scene.step(
      {
        id: 'optics-concave',
        title: 'Change to a concave lens',
        notes:
          'The lens becomes concave and the rays diverge. Pause before turning it into a room.',
      },
      () =>
        scene.play(
          new ReplacementTransform(convex, concave, { duration: 1 }),
          new ReplacementTransform(convexRays, concaveRays, { duration: 1 }),
        ),
    );
    await scene.step(
      {
        id: 'optics-morph',
        title: 'From a lens to a room',
        notes:
          'The concave lens morphs into a room outline. Three light pulses follow paths with four wall reflections each.',
      },
      async () => {
        await scene.play(
          new ReplacementTransform(concave, makeConcertHall(), { duration: 1.5 }),
          new FadeOut(concaveRays, { duration: 0.5 }),
        );
        const origin: Vector3Tuple = [-2.8, -1.1, 0];
        const colors = [C.amber, C.cyan, C.green];
        const rays = [18, 38, 65].map((angle, index) =>
          polyline(bouncingRay(origin, (angle * Math.PI) / 180), colors[index], 2),
        );
        const pulses = colors.map((color) => new Dot({ point: origin, radius: 0.08, color }));
        await scene.play(...rays.map((ray) => new Create(ray, { duration: 1 })));
        scene.add(...pulses);
        await scene.play(
          ...pulses.map(
            (pulse, index) =>
              new MoveAlongPath(pulse, { path: rays[index], duration: 4, rateFunc: linear }),
          ),
        );
      },
    );
  },
} satisfies SceneDefinition;
