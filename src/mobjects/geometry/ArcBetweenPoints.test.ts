import { describe, expect, it } from 'vitest';
import { ArcBetweenPoints } from './ArcBetweenPoints';
import type { Vector3Tuple } from '../../core/Mobject';

describe('ArcBetweenPoints curve geometry', () => {
  // MIGRATION: for planar endpoints and |angle| < 2π, actual curve endpoints
  // equal the requested endpoints, regardless of sweep sign or chord direction.
  it('draws both requested endpoints for signed and nearly straight sweeps', () => {
    const endpoints: [Vector3Tuple, Vector3Tuple] = [
      [-1, -2, 0],
      [2, 1, 0],
    ];
    for (const angle of [Math.PI / 3, -Math.PI / 3, 1.5 * Math.PI, 1e-12, 0]) {
      for (const [start, end] of [endpoints, [...endpoints].reverse()]) {
        const arc = new ArcBetweenPoints({ start, end, angle });
        const points = arc.getPoints();
        expect(points[0]).toEqual(start);
        expect(points.at(-1)).toEqual(end);
        expect(arc.pointFromProportion(0)).toEqual(start.map((value) => expect.closeTo(value, 8)));
        expect(arc.pointFromProportion(1)).toEqual(end.map((value) => expect.closeTo(value, 8)));
        expect(points.flat().every(Number.isFinite)).toBe(true);
        if (Math.abs(angle) < 1e-10) {
          expect(points[1][0]).toBeCloseTo(start[0] + (end[0] - start[0]) / 3);
          expect(points[1][1]).toBeCloseTo(start[1] + (end[1] - start[1]) / 3);
        }
      }
    }
  });
});
