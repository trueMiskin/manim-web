// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { Player } from '../player/Player';
import { slide } from './declarative';
import { bullets, columns, math, paragraph } from './declarativeBlocks';
import { loadScene } from './compile';

const players: Player[] = [];

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return createCanvas(Math.max(1, this.width), Math.max(1, this.height)).getContext(
      '2d',
    ) as unknown as CanvasRenderingContext2D;
  });
});

afterEach(() => {
  players.splice(0).forEach((player) => player.dispose());
  vi.restoreAllMocks();
});

function player(): Player {
  const result = new Player(document.createElement('div'), {
    headless: true,
    ui: false,
    keyboard: false,
    pointer: false,
  });
  players.push(result);
  return result;
}

// MIGRATION: each build adds exactly its referenced blocks, preserves earlier
// geometry, and restores independently of seek order or another document build.
it('compiles static content and nested columns into repeatable named builds', async () => {
  const authored = slide('lesson', {
    title: 'A quadratic lesson',
    notes: 'Start with the function.',
    content: [
      paragraph('Observe the minimum.'),
      columns(
        [
          [math('f(x)=x^2'), paragraph('Follow the slope.', { id: 'explanation' })],
          bullets(['Choose a step.', 'Repeat the update.'], { id: 'procedure' }),
        ],
        { widths: [3, 2] },
      ),
    ],
    builds: [
      { id: 'slope', show: ['explanation'], notes: 'The derivative gives the slope.' },
      { id: 'steps', show: ['procedure'] },
    ],
  });
  const definition = await loadScene(authored);
  const first = player();
  await first.sequence(definition.build);
  expect(first.checkpoints.map(({ id, notes }) => ({ id, notes }))).toEqual([
    { id: 'content', notes: 'Start with the function.' },
    { id: 'slope', notes: 'The derivative gives the slope.' },
    { id: 'steps', notes: 'Start with the function.' },
  ]);
  first.seekCheckpoint('content');
  const initial = first.inspectText();
  const text = () =>
    first
      .inspectText()
      .map((run) => run.text)
      .join(' ');
  expect(text()).toContain('Observe');
  expect(text()).not.toMatch(/Follow|Choose/);
  first.seekCheckpoint('steps');
  expect(text()).toMatch(/Follow.*Choose.*Repeat/);
  const completed = first.inspectText();
  first.seekCheckpoint('slope');
  expect(text()).toContain('Follow');
  expect(text()).not.toContain('Choose');
  first.seekCheckpoint('content');
  expect(first.inspectText()).toEqual(initial);
  first.seekCheckpoint('steps');
  expect(first.inspectText()).toEqual(completed);

  const second = player();
  await second.sequence(definition.build);
  second.seekCheckpoint('content');
  expect(first.inspectText()).toEqual(completed);
  const geometry = (instance: Player) =>
    instance
      .inspectText()
      .map(({ text, transform, width, height }) => ({ text, transform, width, height }));
  first.seekCheckpoint('content');
  expect(geometry(second)).toEqual(geometry(first));
});

// MIGRATION: invalid document references fail before rendering; layout failures
// identify the authored slide and cannot leak a partially prepared document.
it('rejects unknown build targets and reports the slide that overflows', async () => {
  expect(() =>
    slide('broken', {
      title: 'Missing block',
      content: paragraph('Only this block exists.'),
      builds: [{ id: 'next', show: ['missing'] }],
    }),
  ).toThrow('broken/next');
  expect(() => columns([paragraph('One'), paragraph('Two')], { widths: [1] })).toThrow('width');

  const authored = slide('too-large', {
    title: 'Overflow',
    content: math('x'.repeat(100)),
  });
  const definition = await loadScene(authored);
  await expect(player().sequence(definition.build)).rejects.toThrow(/Slide "too-large".*width/);
});
