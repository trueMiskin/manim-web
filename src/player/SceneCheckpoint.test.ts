// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Scene } from '../core/Scene';
import { Square } from '../mobjects/geometry/Rectangle';
import type { MobjectState } from '../core/StateManager';
import { Mobject } from '../core/Mobject';
import { VMobject } from '../core/VMobject';
import { Arrow, DoubleArrow } from '../mobjects/geometry/Arrow';
import { captureScene, restoreScene } from './SceneCheckpoint';
import { Mesh, MeshBasicMaterial } from 'three';

describe('immutable checkpoint storage', () => {
  // MIGRATION: restoring equal points still restores topology-relevant styles;
  // fill and stroke meshes follow the checkpoint after either was hidden.
  it('restores fill and stroke geometry when points stay identical', () => {
    const scene = new Scene(document.createElement('div'), { headless: true });
    const square = new Square().setFillOpacity(1).setStrokeWidth(3);
    scene.add(square);
    const filled = captureScene(scene);
    square.setFillOpacity(0).setStrokeWidth(0);
    scene.render();
    const empty = captureScene(scene);
    const hasFill = () =>
      square
        .getThreeObject()
        .children.some(
          (child) => child instanceof Mesh && child.material instanceof MeshBasicMaterial,
        );
    expect(hasFill()).toBe(false);
    restoreScene(scene, filled);
    expect(hasFill()).toBe(true);
    expect(square.getThreeObject().children.length).toBeGreaterThan(1);
    restoreScene(scene, empty);
    expect(hasFill()).toBe(false);
    expect(square.getThreeObject().children).toHaveLength(0);
    scene.dispose();
  });

  // MIGRATION: restored arrow endpoint/configuration queries agree with the
  // restored child geometry and remain valid for subsequent endpoint updates.
  it.each([Arrow, DoubleArrow])(
    'restores %s endpoint caches without replacing children',
    (ArrowClass) => {
      const scene = new Scene(document.createElement('div'), { headless: true });
      const arrow = new ArrowClass({
        start: [-1, 0, 0],
        end: [2, 0, 0],
        tipLength: 0.3,
        tipWidth: 0.1,
      });
      arrow.shift([1, 2, 0]);
      scene.add(arrow);
      const checkpoint = captureScene(scene);
      const children = [...arrow.children];
      const start = arrow.getStart();
      const end = arrow.getEnd();
      arrow.putStartAndEndOn([0, 0, 0], [7, 2, 0]);
      arrow.setTipLength(0.6).setTipWidth(0.2);
      restoreScene(scene, checkpoint);
      expect(arrow.getStart()).toEqual(start);
      expect(arrow.getEnd()).toEqual(end);
      expect(arrow.getTipLength()).toBe(0.3);
      expect(arrow.getTipWidth()).toBe(0.1);
      expect(arrow.children).toEqual(children);
      const fresh = new ArrowClass({
        start: [0, 0, 0],
        end: [3, 1, 0],
        tipLength: 0.3,
        tipWidth: 0.1,
      });
      arrow.position.set(0, 0, 0);
      arrow.putStartAndEndOn([0, 0, 0], [3, 1, 0]);
      arrow.children.forEach((child, index) =>
        expect((child as VMobject).getPoints()).toEqual(
          (fresh.children[index] as VMobject).getPoints(),
        ),
      );
      fresh.dispose();
      scene.dispose();
    },
  );
  // MIGRATION: compound contour boundaries survive copying and checkpoint
  // restoration after a transform installs temporary path alignment metadata.
  it('restores authored contour boundaries after temporary alignment', () => {
    const scene = new Scene(document.createElement('div'), { headless: true });
    const path = new VMobject().setPoints([
      ...new Square().getLocalPoints(),
      ...new Square({ sideLength: 1 }).getLocalPoints(),
    ]);
    const length = new Square().getLocalPoints().length;
    path.setBaseSubpathLengths([length, length]);
    scene.add(path);
    const checkpoint = captureScene(scene);
    path.setTransformSubpathLengths([length * 2]);
    restoreScene(scene, checkpoint);
    expect(path.getEffectiveSubpathLengths()).toEqual([length, length]);
    expect(path.copy().getEffectiveSubpathLengths()).toEqual([length, length]);
    scene.dispose();
  });

  // MIGRATION: unchanged geometry shares storage across captures, while each
  // snapshot remains immutable and restores independently after later changes.
  it('shares unchanged branches without aliasing mutable scene state', () => {
    const scene = new Scene(document.createElement('div'), { headless: true });
    const square = new Square();
    scene.add(square);
    const cache = new WeakMap<Mobject, MobjectState>();
    const first = captureScene(scene, [], cache);
    const same = captureScene(scene, [], cache);
    const before = first.objects.find((entry) => entry.object === square)!.state;
    expect(same.objects.find((entry) => entry.object === square)!.state).toBe(before);
    const setPoints = vi.spyOn(square, 'setPoints');
    restoreScene(scene, same);
    expect(setPoints).not.toHaveBeenCalled();
    square.shift([2, 0, 0]);
    const moved = captureScene(scene, [], cache);
    const after = moved.objects.find((entry) => entry.object === square)!.state;
    expect(after).not.toBe(before);
    expect(after.points3D).toBe(before.points3D);
    expect(Object.isFrozen(after.points3D?.[0])).toBe(true);
    expect(before.position).toEqual([0, 0, 0]);
    square.setPointsAsCorners([
      [0, 0, 0],
      [3, 2, 0],
    ]);
    restoreScene(scene, first);
    expect(square.getBoundingBox().width).toBeCloseTo(2);
    restoreScene(scene, moved);
    expect(square.getCenter()[0]).toBeCloseTo(2);
    scene.dispose();
  });
});
