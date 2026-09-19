import { describe, expect, it } from 'vitest';
import reference from '../../tests/fixtures/presentation/propagation.json';
import {
  lensRayCoordinates,
  makeLens,
  traceHallRay,
  type LensType,
} from '../../examples/presentations/tech-demo/scenes/optics-geometry';
import type { Vector3Tuple } from '../core/Mobject';
import { alignVmobjectPair } from '../animation/transform/TransformPairing';
import { lerpPoint } from '../utils/math';

// MIGRATION: independent pinned Python helper results check scientific geometry,
// rather than reproducing the TypeScript implementation in the test.
function expectCoordinates(actual: number[][], expected: number[][]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point).toHaveLength(expected[index].length);
    point.forEach((value, axis) => expect(value).toBeCloseTo(expected[index][axis], 12));
  });
}

describe('propagation geometry matches pinned original Python helpers', () => {
  // MIGRATION: a morph between symmetric lenses preserves both reflection axes.
  it('keeps the lens upright and symmetric throughout the convex-to-concave morph', () => {
    const source = makeLens('convex');
    const target = makeLens('concave');
    const aligned = alignVmobjectPair(source, target);
    for (const alpha of [0.1, 0.5, 0.9]) {
      const points = aligned.startPoints.map((point, index) =>
        lerpPoint(point, aligned.targetPoints[index], alpha),
      );
      for (const [x, y] of points) {
        for (const [sx, sy] of [
          [-1, 1],
          [1, -1],
        ]) {
          expect(
            points.some(([px, py]) => Math.abs(px - sx * x) < 1e-8 && Math.abs(py - sy * y) < 1e-8),
          ).toBe(true);
        }
      }
    }
    source.dispose();
    target.dispose();
  });

  for (const type of ['convex', 'thick_convex', 'concave'] as LensType[]) {
    it(`preserves all ${type} lens ray coordinates`, () => {
      const paths = lensRayCoordinates(type);
      expect(paths).toHaveLength(reference.lensRays[type].length);
      paths.forEach((path, index) => expectCoordinates(path, reference.lensRays[type][index]));
    });
  }
  it('preserves all nine concert hall rays and both wall intersections', () => {
    for (const ray of reference.hallRays) {
      expectCoordinates(
        traceHallRay(ray.origin as Vector3Tuple, (ray.angleDegrees * Math.PI) / 180),
        ray.points,
      );
    }
  });
});
