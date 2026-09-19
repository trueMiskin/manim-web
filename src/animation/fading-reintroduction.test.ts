// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Scene } from '../core/Scene';
import { Group } from '../core/Group';
import { Square } from '../mobjects/geometry/Rectangle';
import { Player } from '../player/Player';
import { linear } from '../rate-functions';
import { FadeIn } from './fading/FadeIn';
import { FadeOut } from './fading/FadeOut';

describe('faded object reintroduction', () => {
  // MIGRATION: for any authored opacity, removal and reintroduction restore
  // that opacity throughout groups, including authored zero and partial fills.
  it('preserves authored opacity across scene playback and animation reuse', async () => {
    const scene = Scene.createHeadless();
    try {
      for (const opacity of [0, 0.4]) {
        const child = new Square();
        const group = new Group(child);
        group.opacity = opacity;
        child.fillOpacity = 0.65;
        const fadeOut = new FadeOut(group, { duration: 0 });
        const fadeIn = new FadeIn(group, { duration: 0 });
        scene.add(group);
        await scene.play(fadeOut);
        expect(scene.mobjects.has(group)).toBe(false);
        await scene.play(fadeIn);
        expect(scene.mobjects.has(group)).toBe(true);
        expect(group.opacity).toBe(opacity);
        expect(child.opacity).toBe(opacity);
        expect(child.fillOpacity).toBe(0.65);
        fadeOut.reset();
        fadeIn.reset();
        await scene.play(fadeOut);
        await scene.play(fadeIn);
        expect(group.opacity).toBe(opacity);
        expect(child.opacity).toBe(opacity);
        expect(child.fillOpacity).toBe(0.65);
      }
    } finally {
      scene.dispose();
    }
  });

  // MIGRATION: compiled FadeOut→FadeIn visibility and authored opacity are
  // functions of timeline time, independent of checkpoint/seek history.
  it('restores removed objects across compiled checkpoints and backward seeking', async () => {
    const player = new Player(document.createElement('div'), {
      headless: true,
      ui: false,
      keyboard: false,
      pointer: false,
    });
    const square = new Square();
    square.opacity = 0.4;
    try {
      await player.sequence(async (scene) => {
        scene.add(square);
        await scene.step({ id: 'out' }, () =>
          scene.play(new FadeOut(square, { rateFunc: linear })),
        );
        await scene.step({ id: 'in' }, () => scene.play(new FadeIn(square, { rateFunc: linear })));
      });
      player.seekCheckpoint('in');
      expect(player.scene.mobjects.has(square)).toBe(true);
      expect(square.opacity).toBe(0.4);
      player.seekCheckpoint('out');
      expect(player.scene.mobjects.has(square)).toBe(false);
      player.seek(1.5);
      expect(player.scene.mobjects.has(square)).toBe(true);
      expect(square.opacity).toBeCloseTo(0.2);
      player.seek(0.5);
      expect(square.opacity).toBeCloseTo(0.2);
      player.seekCheckpoint('in');
      expect(square.opacity).toBe(0.4);
    } finally {
      player.dispose();
    }
  });
});
