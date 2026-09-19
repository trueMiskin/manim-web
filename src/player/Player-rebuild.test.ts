// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Scene } from '../core/Scene';
import { Square } from '../mobjects/geometry/Rectangle';
import { Transform } from '../animation/transform/Transform';
import { Player } from './Player';

function createPlayer(scene?: Scene) {
  return new Player(document.createElement('div'), {
    headless: true,
    ui: false,
    keyboard: false,
    pointer: false,
    scene,
  });
}

describe('Player compilation ownership', () => {
  // MIGRATION: rebuilding and releasing a recorder never disposes borrowed
  // mobjects, including detached animation targets and later reused sources.
  it('keeps caller objects alive across rebuilding and borrowed-scene disposal', async () => {
    const scene = new Scene(document.createElement('div'), { headless: true });
    const player = createPlayer(scene);
    const source = new Square();
    const target = new Square({ sideLength: 3 });
    const disposeSource = vi.spyOn(source, 'dispose');
    const disposeTarget = vi.spyOn(target, 'dispose');
    await player.sequence(async (recording) => {
      recording.add(source);
      await recording.play(new Transform(source, target));
    });
    await player.sequence(async (recording) => {
      recording.add(source);
      await recording.play(new Transform(source, target));
      recording.remove(source);
      await recording.wait(1);
      recording.disposeDetached();
    });
    player.seek(2);
    player.dispose();
    expect(disposeSource).not.toHaveBeenCalled();
    expect(disposeTarget).not.toHaveBeenCalled();
    source.dispose();
    target.dispose();
    scene.dispose();
  });

  // MIGRATION: a rejected rebuild leaves the previous timeline, resources,
  // navigation metadata and displayed world state usable at the saved time.
  it('restores the previous frame and timeline when a replacement fails', async () => {
    const player = createPlayer();
    const square = new Square();
    const dispose = vi.spyOn(square, 'dispose');
    await player.sequence(async (recording) => {
      recording.add(square);
      await recording.step({ id: 'move' }, () => recording.play(square.animate.shift([4, 0, 0])));
    });
    player.seek(0.5);
    square.shift([0, 2, 0]);
    const center = square.getCenter();
    const timeline = player.timeline;
    const checkpoints = player.checkpoints;
    await expect(
      player.sequence(async (recording) => {
        recording.add(square);
        await recording.play(square.animate.shift([20, 0, 0]));
        throw new Error('replacement failed');
      }),
    ).rejects.toThrow('replacement failed');
    expect(player.timeline).toBe(timeline);
    expect(player.checkpoints).toBe(checkpoints);
    expect(player.timeline.getCurrentTime()).toBe(0.5);
    expect(player.scene.mobjects.has(square)).toBe(true);
    expect(square.getCenter()).toEqual(center);
    expect(dispose).not.toHaveBeenCalled();
    player.seekCheckpoint('move');
    expect(square.getCenter()).toEqual([4, 0, 0]);
    player.seek(0.5);
    expect(square.getCenter()).toEqual([2, 0, 0]);
    player.dispose();
  });
});
