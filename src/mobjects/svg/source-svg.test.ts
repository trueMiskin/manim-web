// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SVGMobject, VMobjectFromSVGPath } from './SVGMobject';

describe('compact source SVG paths', () => {
  // MIGRATION: optional SVG whitespace does not alter any parsed control point.
  it('retains adjacent signed decimals and exponent coordinates', () => {
    const compact = new VMobjectFromSVGPath({ pathData: 'M219.3.5c3.1-.6 6.3-.6 9.4 0l2e2-4e1' });
    const spaced = new VMobjectFromSVGPath({
      pathData: 'M219.3 0.5 c3.1 -0.6 6.3 -0.6 9.4 0 l200 -40',
    });
    expect(compact.getLocalPoints()).toEqual(spaced.getLocalPoints());
    expect(compact.getLocalPoints().flat().every(Number.isFinite)).toBe(true);
  });

  // MIGRATION: complete authored icon paths remain finite through SVG scaling.
  it('loads both source icons without invalid geometry', () => {
    for (const name of ['speaker', 'listener']) {
      const svgString = readFileSync(
        resolve(__dirname, `../../../tests/fixtures/presentation/assets/${name}.svg`),
        'utf8',
      );
      const icon = new SVGMobject({ svgString, height: 0.6 });
      expect(icon.getLocalPoints().flat().every(Number.isFinite)).toBe(true);
      expect(icon.getHeight()).toBeCloseTo(0.6);
      expect(icon.getWidth()).toBeGreaterThan(0);
    }
  });
});
