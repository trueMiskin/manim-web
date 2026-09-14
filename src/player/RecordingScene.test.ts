// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Player } from './Player';
import { Square } from '../mobjects/geometry/Rectangle';
import { Group } from '../core/Group';
import { GrowFromCenter } from '../animation/growing';
import { ValueTracker } from '../mobjects/value-tracker/ValueTracker';
import { TracedPath } from '../animation/changing';
import { ThreeDScene } from '../core/ThreeDScene';

function player() {
  return new Player(document.createElement('div'), {
    headless: true,
    ui: false,
    keyboard: false,
    pointer: false,
  });
}

describe('compiled scene checkpoints', () => {
  // MIGRATION: sequential authored state equals direct seek for every checkpoint and seek history.
  it('restores grow, independent fill/stroke, membership, and changed child topology', async () => {
    const p = player();
    const square = new Square().setStyle({
      fillColor: '#00ff00',
      fillOpacity: 1,
      strokeColor: '#a0522d',
    });
    const group = new Group(square);
    const other = new Square();
    await p.sequence(async (scene) => {
      await scene.step({ id: 'grow' }, () => scene.play(new GrowFromCenter(group)));
      expect(square.getBoundingBox().width).toBeGreaterThan(1);
      await scene.step({ id: 'remove' }, () => {
        scene.remove(group);
      });
      await scene.step({ id: 'replace-child' }, () => {
        group.remove(square);
        group.add(other);
        scene.add(group);
      });
    });
    p.seekCheckpoint('replace-child');
    expect(group.children).toEqual([other]);
    p.seekCheckpoint('remove');
    expect(p.scene.mobjects.has(group)).toBe(false);
    p.seekCheckpoint('grow');
    expect(group.children).toEqual([square]);
    expect(square.getBoundingBox().width).toBeGreaterThan(1);
    expect(square.style.fillColor).toBe('#00ff00');
    expect(square.style.strokeColor).toBe('#a0522d');
    p.seekCheckpoint('grow', 'start');
    p.seekCheckpoint('grow');
    expect(group.scaleVector.x).toBe(1);
    p.dispose();
  });

  // MIGRATION: tracker, dependent geometry, traces and camera are functions of timeline time.
  it('replays updater and camera state and restores an exact frame after failed capture', async () => {
    const p = player();
    const tracker = new ValueTracker();
    const dot = new Square();
    const trace = new TracedPath(dot);
    dot.addUpdater(() => dot.moveTo([tracker.getValue(), 0, 0]));
    await p.sequence(async (scene) => {
      scene.add(dot, trace);
      await scene.step({ id: 'move' }, () => scene.play(tracker.animateTo(3)));
      expect(tracker.getValue()).toBe(3);
      await scene.step({ id: 'camera' }, () => {
        scene.camera.frame.moveTo([3, 1, 0]);
      });
    });
    p.seek(0.5);
    const points = trace.getLocalPoints();
    const value = tracker.getValue();
    p.seekCheckpoint('camera');
    p.seek(0.5);
    expect(tracker.getValue()).toBe(value);
    expect(trace.getLocalPoints()).toEqual(points);
    expect(p.scene.camera.position.x).toBe(0);
    await expect(
      p.withFrozenState(() => {
        p.seekCheckpoint('camera');
        throw new Error('capture failed');
      }),
    ).rejects.toThrow('capture failed');
    expect(p.timeline.getCurrentTime()).toBe(0.5);
    expect(trace.getLocalPoints()).toEqual(points);
    p.dispose();
  });

  // MIGRATION: an embedded player owns only its explicitly transferred resources and handlers.
  it('accepts a borrowed 3D scene and installs no input handlers when disabled', async () => {
    const container = document.createElement('div');
    const scene = new ThreeDScene(container, { headless: true, enableOrbitControls: false });
    const p = new Player(container, { scene, ui: false, keyboard: false, pointer: false });
    await p.sequence(async (recording) => {
      await recording.wait(1);
    });
    container.dispatchEvent(new MouseEvent('click'));
    expect(p.isPlaying).toBe(false);
    expect(container.hasAttribute('tabindex')).toBe(false);
    expect(p.scene).toBe(scene);
    p.dispose();
    expect(() => scene.render()).not.toThrow();
    scene.dispose();
  });
});
