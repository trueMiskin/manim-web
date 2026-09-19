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
import { defineSlide } from '../../../../src/reveal';
import { subVec } from '../../../../src/utils/vectors';
import { TECH_THEME, label } from './common';
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

export default defineSlide(
  { title: 'Shape morphing', theme: TECH_THEME, titleVisible: false },
  async (s) => {
    const caption = label(
      'A lens becomes a room; light keeps bouncing',
      22,
      s.colors.muted,
      [0, -2.8, 0],
    );
    const convex = makeLens('convex', s.colors);
    const convexRays = lensRays('convex', s.colors.yellow);

    await s.step(
      {
        id: 'optics-convex',
        title: 'Create a lens and its rays',
        notes: 'Vector geometry and seven ray paths appear together.',
      },
      () =>
        s.play(
          new FadeIn(s.title),
          new FadeIn(caption),
          new Create(convex),
          new Create(convexRays),
        ),
    );
    const concave = makeLens('concave', s.colors);
    const concaveRays = lensRays('concave', s.colors.yellow);
    await s.step(
      {
        id: 'optics-concave',
        title: 'Change to a concave lens',
        notes:
          'The lens becomes concave and the rays diverge. Pause before turning it into a room.',
      },
      () =>
        s.play(
          new ReplacementTransform(convex, concave, { duration: 1 }),
          new ReplacementTransform(convexRays, concaveRays, { duration: 1 }),
        ),
    );
    await s.step(
      {
        id: 'optics-morph',
        title: 'From a lens to a room',
        notes:
          'The concave lens morphs into a room outline. Three light pulses follow paths with four wall reflections each.',
      },
      async () => {
        await s.play(
          new ReplacementTransform(concave, makeConcertHall(s.colors), { duration: 1.5 }),
          new FadeOut(concaveRays, { duration: 0.5 }),
        );
        const origin: Vector3Tuple = [-2.8, -1.1, 0];
        const colors = [s.colors.amber, s.colors.cyan, s.colors.green];
        const rays = [18, 38, 65].map((angle, index) =>
          polyline(bouncingRay(origin, (angle * Math.PI) / 180), colors[index], 2),
        );
        const pulses = colors.map((color) => new Dot({ point: origin, radius: 0.08, color }));
        await s.play(...rays.map((ray) => new Create(ray, { duration: 1 })));
        s.scene.add(...pulses);
        await s.play(
          ...pulses.map(
            (pulse, index) =>
              new MoveAlongPath(pulse, { path: rays[index], duration: 4, rateFunc: linear }),
          ),
        );
      },
    );
  },
);
