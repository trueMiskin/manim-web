// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from '../../core/Scene';
import { ImageMobject } from '../../mobjects/image';
import { captureScene, restoreScene } from '../../player/SceneCheckpoint';
import { Animation } from '../Animation';
import { Transform } from './Transform';

function mockCanvas(): void {
  const context = {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
    putImageData: () => {},
    drawImage: () => {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => context) as HTMLCanvasElement['getContext'],
  );
}

describe('textured morph size restoration', () => {
  afterEach(() => vi.restoreAllMocks());

  // MIGRATION: interrupting a textured morph restores both participants' visual
  // dimensions, and checkpoints restore their world bounds after any size change.
  it('unwinds an interrupted image morph and restores checkpoint dimensions', async () => {
    mockCanvas();
    const source = new ImageMobject({ pixelData: [[255]], height: 2 });
    const target = new ImageMobject({ pixelData: [[0]], height: 1 });
    await Promise.all([source.waitForLoad(), target.waitForLoad()]);
    const scene = new Scene(document.createElement('div'), { headless: true });
    scene.add(source);
    const checkpoint = captureScene(scene, [target]);
    const sourceBounds = source.getBounds();
    const targetBounds = target.getBounds();
    const animation = new Transform(source, target);
    Animation.withExternalState([animation], () => {
      animation.begin();
      animation.interpolate(0.4);
      expect(source.getBounds().max.x - source.getBounds().min.x).toBeCloseTo(1.6);
      animation.reset();
    });
    expect(source.getBounds()).toEqual(sourceBounds);
    expect(target.getBounds()).toEqual(targetBounds);
    source.applyVisualSize(7, 3);
    target.applyVisualSize(4, 5);
    restoreScene(scene, checkpoint);
    expect(source.getBounds()).toEqual(sourceBounds);
    expect(target.getBounds()).toEqual(targetBounds);
    expect(target.getThreeObject().parent).toBeNull();
    animation.dispose();
    scene.dispose();
    target.dispose();
  });

  // MIGRATION: completed textured morphs retain target dimensions after reset,
  // until a checkpoint explicitly restores the source's earlier world bounds.
  it('preserves completed image sizes and restores checkpoints in both directions', async () => {
    mockCanvas();
    const source = new ImageMobject({ pixelData: [[255]], height: 2 });
    const target = new ImageMobject({ pixelData: [[0]], height: 1 });
    await Promise.all([source.waitForLoad(), target.waitForLoad()]);
    const scene = new Scene(document.createElement('div'), { headless: true });
    scene.add(source);
    const before = captureScene(scene, [target]);
    const animation = new Transform(source, target);
    Animation.withExternalState([animation], () => {
      animation.begin();
      animation.interpolate(1);
      animation.finish();
      animation.reset();
    });
    expect(source.getBounds().max.x - source.getBounds().min.x).toBeCloseTo(1);
    const after = captureScene(scene, [target]);
    restoreScene(scene, before);
    expect(source.getBounds().max.x - source.getBounds().min.x).toBeCloseTo(2);
    restoreScene(scene, after);
    expect(source.getBounds().max.x - source.getBounds().min.x).toBeCloseTo(1);
    animation.dispose();
    scene.dispose();
    target.dispose();
  });
});
