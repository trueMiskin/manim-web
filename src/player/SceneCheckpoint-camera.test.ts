// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Scene } from '../core/Scene';
import { ThreeDScene } from '../core/ThreeDScene';
import { Player } from './Player';
import { captureScene, restoreScene } from './SceneCheckpoint';

describe('checkpoint camera viewport fitting', () => {
  // MIGRATION: camera checkpoint restoration preserves authored pose and frame
  // policy while deriving the projection from the current viewport dimensions.
  it('restores a contained frame without retaining viewport padding', () => {
    const scene = new Scene(document.createElement('div'), {
      headless: true,
      width: 800,
      height: 450,
      frameWidth: 6,
      frameHeight: 4,
    });
    scene.camera.aspectMode = 'contain';
    scene.camera.moveTo([2, 3, 10]);
    const checkpoint = captureScene(scene);
    scene.resize(800, 800);
    scene.camera.aspectMode = 'fill';
    scene.camera.frameHeight = 20;
    scene.camera.moveTo([9, 9, 10]);
    restoreScene(scene, checkpoint);
    expect(scene.camera.position.toArray()).toEqual([2, 3, 10]);
    expect(scene.camera.aspectMode).toBe('contain');
    expect(scene.camera.frameWidth).toBe(6);
    expect(scene.camera.frameHeight).toBe(6);
    scene.resize(400, 800);
    restoreScene(scene, checkpoint);
    expect(scene.camera.frameWidth).toBe(6);
    expect(scene.camera.frameHeight).toBe(12);
    scene.dispose();
  });

  // MIGRATION: perspective checkpoints restore pose/FOV, independent of the
  // current viewport aspect and its projection matrix.
  it('fits a restored perspective camera to the current renderer', () => {
    const scene = new ThreeDScene(document.createElement('div'), {
      headless: true,
      enableOrbitControls: false,
      width: 800,
      height: 450,
    });
    scene.camera3D.moveTo([3, 4, 9]).setLookAt([1, 2, 0]).setFov(35);
    const checkpoint = captureScene(scene);
    scene.resize(800, 800);
    scene.camera3D.moveTo([9, 9, 9]).setFov(80);
    restoreScene(scene, checkpoint);
    const camera = scene.camera3D.getCamera();
    expect(camera.aspect).toBe(1);
    expect(camera.fov).toBe(35);
    expect(camera.position.toArray()).toEqual([3, 4, 9]);
    expect(scene.camera3D.lookAtTarget.toArray()).toEqual([1, 2, 0]);
    expect(camera.projectionMatrix.elements[0]).toBeCloseTo(camera.projectionMatrix.elements[5]);
    scene.dispose();
  });

  // MIGRATION: every evaluated camera-animation frame uses the current viewport
  // aspect, including after backward seeking and further responsive resizing.
  it('keeps the resized aspect throughout compiled camera animation', async () => {
    const player = new Player(document.createElement('div'), {
      headless: true,
      ui: false,
      keyboard: false,
      pointer: false,
      width: 800,
      height: 450,
    });
    await player.sequence(async (scene) => {
      await scene.play(scene.camera.frame.animate.scale(0.5));
    });
    player.scene.resize(800, 800);
    player.seek(0.6);
    expect(player.scene.camera.frameWidth / player.scene.camera.frameHeight).toBeCloseTo(1);
    player.scene.resize(400, 800);
    player.seek(0.2);
    expect(player.scene.camera.frameWidth / player.scene.camera.frameHeight).toBeCloseTo(0.5);
    player.seek(1);
    expect(player.scene.camera.frameHeight).toBeCloseTo(4);
    expect(player.scene.camera.frameWidth).toBeCloseTo(2);
    player.dispose();
  });
});
