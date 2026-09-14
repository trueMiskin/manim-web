// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MathTex } from './MathTex';
import { Tex } from './Tex';
import { TransformMatchingTex } from '../../animation/transform/TransformMatching';
import { VMobject } from '../../core/VMobject';
import { Write } from '../../animation/creation/Create';

function leafCount(object: VMobject): number {
  return object.children.length
    ? object.children.reduce(
        (count, child) => count + (child instanceof VMobject ? leafCount(child) : 0),
        0,
      )
    : 1;
}

describe('semantic math presentation', () => {
  // MIGRATION: explicit units and matching keys survive copying and render readiness.
  it('retains grouped words and repeated token identities without asynchronous copy duplication', async () => {
    const math = new MathTex({ latex: '{{x}}+{{x}}', matchingKeys: ['left', '+', 'right'] });
    await math.waitForRender();
    expect(math.getMatchingParts()).toHaveLength(3);
    expect(math.getSourceLatex()).toBe('{{x}}+{{x}}');
    const copy = math.copy();
    const count = leafCount(copy);
    await copy.waitForRender();
    expect(leafCount(copy)).toBe(count);
    expect(copy.getSemanticTextRuns().map((run) => run.text)).toEqual(['x', '+', 'x']);
    const tex = new Tex({ latex: '{{Differentiable}} {{ray tracing}}' });
    await tex.waitForRender();
    expect(tex.getMatchingParts()).toHaveLength(3);
    expect(tex.getSourceLatex()).toBe('{{Differentiable}} {{ray tracing}}');
  });

  // MIGRATION: vector writing hides fills during the outline phase and restores the authored style.
  it('draws formula outlines before filling glyphs', async () => {
    const math = new MathTex({ latex: 'x+y' });
    await math.waitForRender();
    const width = math.strokeWidth;
    const write = new Write(math);
    write.begin();
    expect(math.fillOpacity).toBe(0);
    write.interpolate(0.3);
    expect(math.fillOpacity).toBe(0);
    write.interpolate(0.9);
    expect(math.fillOpacity).toBeGreaterThan(0);
    write.finish();
    expect(math.fillOpacity).toBe(1);
    expect(math.strokeWidth).toBe(width);
  });

  // MIGRATION: matched semantic units follow their explicit identity under reordering.
  it('moves repeated tokens to their keyed destinations and owns inserted parts across replay', async () => {
    const source = new MathTex({ latex: ['x', '+', 'x'], matchingKeys: ['left', '+', 'right'] });
    const target = new MathTex({
      latex: ['x', '+', 'x', '=1'],
      matchingKeys: ['right', '+', 'left', 'new'],
    });
    await Promise.all([source.waitForRender(), target.waitForRender()]);
    source.shift([-1, 0.5, 0]);
    target.shift([1.5, -0.25, 0]);
    const before = source.getPart(0).getCenter()[0];
    const destination = target.getPart(2).getCenter()[0];
    const animation = new TransformMatchingTex(source, target, { fadeRatio: 0 });
    animation.begin();
    expect(source.children).toHaveLength(4);
    animation.interpolate(0);
    expect(source.children.every((child) => Number.isFinite(child.opacity))).toBe(true);
    animation.interpolate(1);
    animation.finish();
    expect(source.getPart(0).getCenter()[0]).not.toBeCloseTo(before, 4);
    expect(source.getPart(0).getCenter()[0]).toBeCloseTo(destination, 4);
    const sceneObjects = new Set([source]);
    animation.cleanUpFromScene({
      add: (...objects) => objects.forEach((object) => sceneObjects.add(object as MathTex)),
      remove: (...objects) => objects.forEach((object) => sceneObjects.delete(object as MathTex)),
    });
    expect([...sceneObjects]).toEqual([target]);
    animation.reset();
    animation.begin();
    animation.interpolate(0);
    expect(source.getPart(0).getCenter()[0]).toBeCloseTo(before, 4);
    expect(source.children).toHaveLength(4);
    animation.interpolate(1);
    expect(source.getPart(0).getCenter()[0]).toBeCloseTo(destination, 4);
  });
});
