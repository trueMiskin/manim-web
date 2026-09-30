// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { Player } from '../player/Player';
import { slide, type SlideBuild } from './declarative';
import { bullets, columns, math, paragraph, slot } from './declarativeBlocks';
import { transformMath } from './declarativeEffects';
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

// MIGRATION: a chain of transforms shows exactly one formula per slot at each
// pause, preserves surrounding layout, and restores geometry for any seek order
// or independent build, including seeks from partially completed transforms.
it('morphs named formula parts in a stable slot and replays each build', async () => {
  const authored = slide('morph', {
    title: 'Evolving formula',
    theme: { duration: 0.2 },
    content: [
      columns([
        slot([
          math(
            [
              { key: 'left', latex: 'x' },
              { key: 'right', latex: '+x' },
            ],
            { id: 'original' },
          ),
          math(
            [
              { key: 'left', latex: '\\frac{x}{2}' },
              { key: 'right', latex: '+x' },
            ],
            { id: 'fraction' },
          ),
          math([{ key: 'left', latex: '\\frac{x}{2}' }, { key: 'right', latex: '+x' }, '+1'], {
            id: 'expanded',
          }),
        ]),
        paragraph('A new term appears.', { id: 'explanation' }),
      ]),
      paragraph('Stable footer.'),
    ],
    builds: [
      { id: 'halve', effects: [transformMath('original', 'fraction')] },
      {
        id: 'add',
        show: ['explanation'],
        effects: [transformMath('fraction', 'expanded', { duration: 0.3 })],
      },
    ],
  });
  const definition = await loadScene(authored);
  const first = player();
  await first.sequence(definition.build);
  const geometry = (instance: Player) =>
    instance.inspectText().map(({ source, text, transform, width, height }) => ({
      source,
      text,
      transform,
      width,
      height,
    }));
  const formula = () => first.inspectText().filter((run) => run.kind === 'math');
  const snapshots = new Map<string, ReturnType<typeof geometry>>();
  for (const [checkpoint, latex] of [
    ['content', 'x+x'],
    ['halve', '\\frac{x}{2}+x'],
    ['add', '\\frac{x}{2}+x+1'],
  ]) {
    first.seekCheckpoint(checkpoint);
    expect(
      formula()
        .map((run) => run.text)
        .join(''),
    ).toBe(latex);
    expect(new Set(formula().map((run) => run.mobjectId)).size).toBe(1);
    snapshots.set(checkpoint, geometry(first));
  }
  expect(first.checkpoints[1].endTime - first.checkpoints[1].startTime).toBeCloseTo(0.2);
  expect(first.checkpoints[2].endTime - first.checkpoints[2].startTime).toBeCloseTo(0.3);
  const footer = (snapshot: ReturnType<typeof geometry>) =>
    snapshot.filter((run) => run.source === 'Stable footer.');
  expect(footer(snapshots.get('add')!)).toEqual(footer(snapshots.get('content')!));
  expect(footer(snapshots.get('halve')!)).toEqual(footer(snapshots.get('content')!));
  for (const checkpoint of ['halve', 'content', 'add', 'content', 'halve']) {
    first.seek(0.1);
    expect(
      formula()
        .map((run) => run.text)
        .join(''),
    ).not.toContain('\\frac');
    first.seek(0.35);
    first.seekCheckpoint(checkpoint);
    expect(geometry(first)).toEqual(snapshots.get(checkpoint));
  }
  const second = player();
  await second.sequence(definition.build);
  for (const checkpoint of ['content', 'add']) {
    second.seekCheckpoint(checkpoint);
    expect(geometry(second)).toEqual(snapshots.get(checkpoint));
  }
  expect(geometry(first)).toEqual(snapshots.get('halve'));
});

// MIGRATION: an invalid effect graph fails before rendering: each transform
// has a visible math source, a fresh math target, and exclusive use of both IDs.
it('rejects invalid formula references, conflicting builds, and consumed targets', () => {
  const content = [
    slot([math('x', { id: 'a' }), math('y', { id: 'b' }), math('z', { id: 'c' })]),
    paragraph('Explanation', { id: 'prose' }),
  ];
  const invalid = (builds: SlideBuild[]) => () =>
    slide('invalid', { title: 'Invalid', content, builds });
  expect(invalid([{ id: 'next', effects: [transformMath('a', 'prose')] }])).toThrow(
    /invalid\/next.*math/,
  );
  expect(
    invalid([{ id: 'next', effects: [transformMath('a', 'b'), transformMath('b', 'c')] }]),
  ).toThrow(/same build/);
  expect(invalid([{ id: 'next', effects: [transformMath('b', 'c')] }])).toThrow(/visible/);
  expect(
    invalid([
      { id: 'next', effects: [transformMath('a', 'b')] },
      { id: 'back', effects: [transformMath('b', 'a')] },
    ]),
  ).toThrow(/fresh ID/);
  expect(invalid([{ id: 'overlap', show: ['b'] }])).toThrow(/visible together/);
  expect(() => transformMath('a', 'b', { duration: NaN })).toThrow(/positive finite/);
});
