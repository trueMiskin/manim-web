// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Player } from './Player';
import { Square } from '../mobjects/geometry/Rectangle';
import { ValueTracker } from '../mobjects/value-tracker/ValueTracker';
import { UpdateFromAlphaFunc } from '../animation/UpdateFromAlphaFunc';
import { TracedPath } from '../animation/changing';

function player() {
  return new Player(document.createElement('div'), {
    headless: true,
    ui: false,
    keyboard: false,
    pointer: false,
  });
}

describe('compiled fixed-clock playback', () => {
  // MIGRATION: for monotonically increasing playback time, updater calls equal
  // the number of crossed 60 Hz ticks, independent of elapsed segment time.
  it('advances only new ticks during forward seeks and fractional playback frames', async () => {
    const p = player();
    const square = new Square();
    const updater = vi.fn();
    square.addUpdater(updater);
    await p.sequence(async (scene) => {
      scene.add(square);
      await scene.wait(10);
    });
    updater.mockClear();
    p.seek(0);
    p.seek(5);
    expect(updater).toHaveBeenCalledTimes(301);
    updater.mockClear();
    p.seek(5 + 1 / 60);
    expect(updater).toHaveBeenCalledOnce();
    updater.mockClear();
    p.timeline.play();
    for (let frame = 0; frame < 60; frame++) p.timeline.update(1 / 120);
    expect(updater).toHaveBeenCalledTimes(30);
    p.dispose();
  });

  // MIGRATION: fixed-clock playback and arbitrary exact seeks produce the same
  // observable state at a given tick, independent of fractional seek history.
  it('preserves updater integration, traces and animation lifecycle across seeks and boundaries', async () => {
    const p = player();
    const tracker = new ValueTracker(1);
    tracker.addUpdater((_object, dt) => tracker.setValue(tracker.getValue() * (1 + dt)));
    const square = new Square();
    const trace = new TracedPath(square, { minDistanceToNewPoint: 0 });
    const animation = new UpdateFromAlphaFunc(square, (object, alpha) =>
      object.moveTo([alpha, tracker.getValue(), 0]),
    );
    const begin = vi.spyOn(animation, 'begin');
    await p.sequence(async (scene) => {
      scene.add(tracker, trace);
      await scene.step({ id: 'move' }, () => scene.play(animation));
      await scene.step({ id: 'wait' }, () => scene.wait(1));
    });
    const state = () => ({
      value: tracker.getValue(),
      center: square.getCenter(),
      trace: trace.getLocalPoints(),
    });
    p.seek(0.5);
    const midpoint = state();
    begin.mockClear();
    p.timeline.play();
    for (let frame = 0; frame < 24; frame++) p.timeline.update(1 / 120);
    const forward = state();
    expect(begin).not.toHaveBeenCalled();
    p.seekCheckpoint('wait');
    p.seek(0.7);
    expect(state()).toEqual(forward);
    p.seek(0.537);
    const fractional = state();
    p.seek(0.543);
    p.seek(0.537);
    expect(state()).toEqual(fractional);
    p.timeline.play();
    p.timeline.update(0.02);
    const resumed = state();
    p.seekCheckpoint('move', 'start');
    p.seek(33 / 60);
    expect(state()).toEqual(resumed);
    p.seek(0.5);
    expect(state()).toEqual(midpoint);
    p.seekCheckpoint('move');
    expect(square.getCenter()[0]).toBeCloseTo(1);
    p.dispose();
  });
});
