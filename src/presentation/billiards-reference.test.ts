import { describe, expect, it } from 'vitest';
import reference from '../../tests/fixtures/presentation/billiards.json';
import {
  bouncePath,
  getAllPolygons,
  INITIAL_TX,
  reflectionPath,
  type WallName,
} from '../../examples/presentations/tech-demo/scenes/billiard-geometry';
import type { Vector3Tuple } from '../core/Mobject';

function coordinates(actual: number[][], expected: number[][]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) =>
    point.forEach((value, axis) => expect(value).toBeCloseTo(expected[index][axis], 12)),
  );
}

describe('billiard helpers preserve original source geometry', () => {
  // MIGRATION: pinned original Python functions independently constrain every
  // authored launch direction, wall ordering and sampled transmitter position.
  it('preserves launch rays and image-method backtraces', () => {
    for (const ray of reference.bounceRays)
      coordinates(bouncePath(INITIAL_TX, ray.angle), ray.points);
    for (const path of reference.reflections) {
      const result = reflectionPath(path.tx as Vector3Tuple, path.walls as WallName[]);
      coordinates(result.images, path.images);
      coordinates(result.bounces, path.bounces);
    }
    expect(reflectionPath(INITIAL_TX, ['bottom', 'left']).valid).toBe(false);
    expect(reflectionPath([0.5, -0.5, 0], ['bottom', 'left']).valid).toBe(true);
  });

  it('preserves every MLM region along the original ten-sample motion', () => {
    for (const sample of reference.polygons) {
      const regions = getAllPolygons(sample.tx as Vector3Tuple);
      expect(regions).toHaveLength(sample.polygons.length);
      regions.forEach((region, index) => coordinates(region, sample.polygons[index]));
    }
  });
});
