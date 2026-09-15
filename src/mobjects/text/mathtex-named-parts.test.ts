// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MathTex } from './MathTex';
import { serializeMobject, deserializeMobject } from '../../core/StateManager';
import { TransformMatchingTex } from '../../animation/transform/TransformMatching';

describe('named formula parts', () => {
  // MIGRATION: named parts preserve their identity, authored color, and rendered
  // geometry across readiness, copying, and serialized presentation replay.
  it('retains named styles and geometry in pending copies and restored states', async () => {
    const equation = new MathTex({
      latex: [
        { key: 'incident', latex: String.raw`\theta_i`, color: '#ff0000' },
        '=',
        { key: 'outgoing', latex: String.raw`\theta_r`, color: '#0000ff' },
      ],
    });
    const copy = equation.copy();
    expect(() => equation.part('incident')).toThrow('waitForRender');
    await Promise.all([equation.waitForRender(), copy.waitForRender()]);
    expect(equation.getLatex()).toBe(String.raw`\theta_i=\theta_r`);
    expect(equation.part('incident')).toBe(equation.getPart(0));
    expect(equation.part('incident').color).toBe('#ff0000');
    expect(copy.part('incident').getBounds()).toEqual(equation.part('incident').getBounds());
    expect(copy.part('outgoing').color).toBe('#0000ff');
    expect(copy.part('outgoing').children.every((glyph) => glyph.color === '#0000ff')).toBe(true);
    expect(() => equation.part('missing')).toThrow('Unknown MathTex part');

    const before = equation.part('incident').getCenter();
    const state = serializeMobject(equation);
    equation.part('incident').setColor('#00ff00').shift([2, 0, 0]);
    deserializeMobject(equation, state);
    expect(equation.part('incident').getCenter()).toEqual(before);
    expect(equation.part('incident').color).toBe('#ff0000');
    expect(equation.copy().part('incident').color).toBe('#ff0000');
  });

  // MIGRATION: matching transforms map each explicitly named unit to the target
  // with that identity, regardless of source order or repeated LaTeX content.
  it('matches repeated named tokens through reordering and animation replay', async () => {
    const source = new MathTex({
      latex: [{ key: 'left', latex: 'x' }, '+', { key: 'right', latex: 'x' }],
    });
    const target = new MathTex({
      latex: [{ key: 'right', latex: 'x' }, '+', { key: 'left', latex: 'x' }],
    }).shift([2, 0, 0]);
    await Promise.all([source.waitForRender(), target.waitForRender()]);
    const before = source.part('left').getCenter()[0];
    const destination = target.part('left').getCenter()[0];
    const animation = new TransformMatchingTex(source, target, { fadeRatio: 0 });
    animation.begin();
    animation.interpolate(1);
    animation.finish();
    expect(source.part('left').getCenter()[0]).toBeCloseTo(destination);
    animation.reset();
    animation.begin();
    animation.interpolate(0);
    expect(source.part('left').getCenter()[0]).toBeCloseTo(before);
    animation.interpolate(1);
    expect(source.part('left').getCenter()[0]).toBeCloseTo(destination);
  });

  // MIGRATION: explicitly named identities are nonblank, unique, and consistent
  // with separately supplied matching keys; legacy repeated strings stay valid.
  it('rejects inconsistent names without changing legacy repeated parts', () => {
    expect(() => new MathTex({ latex: [{ key: ' ', latex: 'x' }] }, false)).toThrow('empty');
    expect(
      () =>
        new MathTex(
          {
            latex: [
              { key: 'x', latex: 'a' },
              { key: 'x', latex: 'b' },
            ],
          },
          false,
        ),
    ).toThrow('unique');
    expect(
      () => new MathTex({ latex: [{ key: 'x', latex: 'a' }], matchingKeys: ['y'] }, false),
    ).toThrow('conflicts');
    const legacy = new MathTex({ latex: ['x', '+', 'x'] }, false);
    expect(legacy.getLatex()).toBe('x+x');
    expect(() => legacy.part('x')).toThrow('ambiguous');
  });
});
