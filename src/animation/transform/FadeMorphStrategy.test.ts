// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Group as ThreeGroup } from 'three';
import { Group } from '../../core/Group';
import { Scene } from '../../core/Scene';
import { Circle } from '../../mobjects/geometry/Circle';
import { Square } from '../../mobjects/geometry/Rectangle';
import { captureScene, restoreScene } from '../../player/SceneCheckpoint';
import { Transform } from './Transform';

describe('fallback morph visual ownership', () => {
  // MIGRATION: every attachment introduced by a fallback morph is removed on reset,
  // including after finish, while caller-owned attachments remain attached.
  it('removes its completed visual on reset', () => {
    const source = new Group(new Square());
    const target = new Circle();
    const parent = new ThreeGroup();
    parent.add(source.getThreeObject());
    const animation = new Transform(source, target);
    animation.begin();
    animation.interpolate(1);
    animation.finish();
    expect(target.getThreeObject().parent).toBe(parent);
    animation.reset();
    expect(target.getThreeObject().parent).toBeNull();
    expect(source.opacity).toBe(1);
    animation.dispose();
    source.dispose();
    target.dispose();
  });

  // MIGRATION: checkpoint round trips preserve completed fallback visuals exactly
  // in their authored scene membership, with no visible target before the morph.
  it('restores completed visuals through scene membership in both directions', () => {
    const scene = new Scene(document.createElement('div'), { headless: true });
    const source = new Group(new Square());
    const target = new Circle();
    scene.add(source);
    const before = captureScene(scene, [target]);
    const animation = new Transform(source, target);
    animation.begin();
    animation.interpolate(1);
    animation.finish();
    animation.cleanUpFromScene(scene);
    const after = captureScene(scene, [target]);
    expect(scene.mobjects).toContain(target);
    animation.reset();
    restoreScene(scene, before);
    expect(target.getThreeObject().parent).toBeNull();
    expect(source.opacity).toBe(1);
    restoreScene(scene, after);
    expect(target.getThreeObject().parent).toBe(source.getThreeObject().parent);
    expect(target.opacity).toBe(1);
    expect(source.opacity).toBe(0);
    animation.dispose();
    scene.dispose();
  });
});
