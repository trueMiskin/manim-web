// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { defineSlide } from './defineSlide';
import { Player } from '../player/Player';
import { Circle } from '../mobjects/geometry/Circle';
import { VGroup } from '../core/VGroup';
import { DEFAULT_SLIDE_THEME } from './slideTheme';
import { Create } from '../animation/creation/Create';
import { FadeOut } from '../animation/fading/FadeOut';
import { ReplacementTransform } from '../animation/transform/Transform';
import { TransformMatchingTex } from '../animation/transform/TransformMatching';
import type { AnimationOptions } from '../animation/Animation';
import type { MathTex } from '../mobjects/text/MathTex';
import type { RichParagraph } from '../mobjects/text/RichParagraph';
import type { SlideBullets } from './slideBlocks';

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

function makePlayer(): Player {
  const player = new Player(document.createElement('div'), {
    headless: true,
    ui: false,
    keyboard: false,
    pointer: false,
  });
  players.push(player);
  return player;
}

describe('content slide authoring', () => {
  // MIGRATION: titles obey the same authored-opacity restoration as body blocks,
  // whether initially visible or introduced through an explicit animation;
  // an omitted title alignment centers the title.
  it('restores a default-visible title after fading it out', async () => {
    const player = makePlayer();
    let title!: RichParagraph;
    const definition = defineSlide({ title: 'A returning title' }, async (s) => {
      title = s.title;
      await s.step({ id: 'initial' }, () => {});
      await s.step({ id: 'out' }, () => s.play(new FadeOut(s.title, { duration: 0.1 })));
      await s.step({ id: 'return' }, () => s.reveal(s.title));
    });
    await player.sequence(definition.build);
    const expected = title.getBounds();
    expect(title.getCenter()[0]).toBeCloseTo(0);
    player.seekCheckpoint('out');
    expect(player.inspectText()).toHaveLength(0);
    player.seekCheckpoint('return');
    expect(player.inspectText().some((run) => run.text === 'returning')).toBe(true);
    expect(title.opacity).toBe(1);
    expect(title.getBounds()).toEqual(expected);
    player.seekCheckpoint('initial');
    expect(title.getBounds()).toEqual(expected);
  });

  // MIGRATION: alternative content shares one fixed area; replacing or seeking
  // never moves neighboring blocks or exposes a previous state's selectable text,
  // even when JavaScript callers supply extra animation options.
  it('crossfades slot alternatives and restores an authored title entrance on every seek', async () => {
    const player = makePlayer();
    let title!: RichParagraph;
    let first!: RichParagraph;
    let second!: RichParagraph;
    let footer!: RichParagraph;
    const definition = defineSlide(
      {
        title: 'Laws of light',
        titleVisible: false,
        theme: {
          duration: 0.1,
          fontUrl: '/body.ttf',
          titleFontFamily: 'serif',
          titleAlign: undefined,
        },
      },
      async (s) => {
        title = s.title;
        const description = s.slot();
        first = description.paragraph('Reflection.');
        second = description.paragraph('Refraction.\nThrough the medium.');
        footer = s.paragraph('The diagram stays in place.');
        await s.step({ id: 'empty' }, () => s.show(footer));
        await s.step({ id: 'intro' }, async () => {
          await s.write(s.title);
          await s.show(first);
        });
        const extraOptions: AnimationOptions = { duration: 0.1, shift: [0, 1, 0] };
        await s.step({ id: 'replace' }, () => s.replace(first, second, extraOptions));
        await s.step({ id: 'return' }, () =>
          s.replace(second, first, { duration: 0.1, rateFunc: (t) => t }),
        );
      },
    );
    await player.sequence(definition.build);
    const bounds = {
      first: first.getBounds(),
      second: second.getBounds(),
      footer: footer.getBounds(),
    };
    expect(bounds.first.max.y).toBeCloseTo(bounds.second.max.y);
    expect(bounds.footer.max.y).toBeCloseTo(bounds.second.min.y - DEFAULT_SLIDE_THEME.gap);
    expect(title.getSemanticTextRuns().every((run) => run.font.family === 'serif')).toBe(true);
    expect(title.getSemanticTextRuns().every((run) => run.font.url === undefined)).toBe(true);
    expect(footer.getSemanticTextRuns().every((run) => run.font.url === '/body.ttf')).toBe(true);
    expect(title.getCenter()[0]).toBeCloseTo(0);

    player.seekCheckpoint('empty');
    expect(title.getThreeObject().visible).toBe(false);
    expect(player.inspectText().some((run) => /Reflection|Refraction|Laws/.test(run.text))).toBe(
      false,
    );
    player.seekCheckpoint('intro');
    expect(title.getThreeObject().visible).toBe(true);
    expect(player.inspectText().some((run) => run.text === 'Reflection.')).toBe(true);
    expect(player.inspectText().some((run) => run.text === 'Refraction.')).toBe(false);
    player.seekCheckpoint('replace');
    expect(player.scene.mobjects.has(first)).toBe(false);
    expect(player.inspectText().some((run) => run.text === 'Reflection.')).toBe(false);
    expect(player.inspectText().some((run) => run.text === 'Refraction.')).toBe(true);
    player.seek(0.15);
    const partial = player.inspectText();
    player.seekCheckpoint('return');
    expect(player.scene.mobjects.has(second)).toBe(false);
    expect(player.inspectText().some((run) => run.text === 'Reflection.')).toBe(true);
    player.seek(0.15);
    expect(player.inspectText()).toEqual(partial);
    player.seekCheckpoint('intro');
    expect({
      first: first.getBounds(),
      second: second.getBounds(),
      footer: footer.getBounds(),
    }).toEqual(bounds);
  });

  // MIGRATION: any seek history preserves layout and reveals exactly the objects
  // authored at that checkpoint, including complete multi-line bullet rows.
  it('reserves hidden content and restores individually revealed rows without moving earlier blocks', async () => {
    const player = makePlayer();
    let intro!: RichParagraph;
    let bullets!: SlideBullets;
    const definition = defineSlide(
      { title: 'A small lesson', theme: { duration: 0.1 } },
      async (s) => {
        intro = s.paragraph(String.raw`Choose $\eta > 0$ before taking a step.`);
        bullets = s.bullets(['Follow the gradient.', 'Repeat the update.']);
        await s.step({ id: 'intro', notes: 'Introduce the step size.' }, () => s.write(intro));
        await s.step({ id: 'first' }, () => s.reveal(bullets.item(0)));
        await s.step({ id: 'second' }, () => s.reveal(bullets.item(1)));
      },
    );
    await player.sequence(definition.build);
    const bounds = intro.getBounds();
    player.seekCheckpoint('intro');
    expect(bullets.item(0).getThreeObject().visible).toBe(false);
    expect(bullets.item(1).getThreeObject().visible).toBe(false);
    expect(player.inspectText().some((run) => run.text.includes('Repeat'))).toBe(false);
    player.seekCheckpoint('second');
    expect(player.inspectText().some((run) => run.text.includes('Repeat'))).toBe(true);
    expect(bullets.item(0).getBounds().min.y).toBeGreaterThan(bullets.item(1).getBounds().max.y);
    player.seekCheckpoint('first');
    expect(bullets.item(0).getThreeObject().visible).toBe(true);
    expect(bullets.item(1).getThreeObject().visible).toBe(false);
    expect(intro.getBounds()).toEqual(bounds);
    player.seek(0.04);
    const partial = player.inspectText().map((run) => run.text);
    player.seekCheckpoint('second');
    player.seek(0.04);
    expect(player.inspectText().map((run) => run.text)).toEqual(partial);
  });

  // MIGRATION: column weights determine disjoint bounds while grouping for
  // placement preserves the relative geometry and identities of every child.
  // A left-aligned title shares the prose column's left edge.
  it('lays out wrapped content beside a diagram without reparenting its children', async () => {
    const player = makePlayer();
    let title!: RichParagraph;
    let prose!: RichParagraph;
    let diagram!: VGroup;
    let leftCircle!: Circle;
    let rightCircle!: Circle;
    const definition = defineSlide(
      { title: 'Two views', theme: { titleAlign: 'left', colors: { accent: '#ff8800' } } },
      async (s) => {
        title = s.title;
        const [content, figure] = s.columns([3, 2]);
        prose = content.paragraph(
          'A longer explanation wraps inside its own column and leaves the diagram clear.',
          { color: 'accent' },
        );
        leftCircle = new Circle({ radius: 1 }).shift([-1.2, 0, 0]);
        rightCircle = new Circle({ radius: 1 }).shift([1.2, 0, 0]);
        diagram = figure.place(new VGroup(leftCircle, rightCircle), { height: 2.5 });
        await s.step({ id: 'both' }, () => s.show(prose, diagram));
      },
    );
    await player.sequence(definition.build);
    player.seekCheckpoint('both');
    expect(title.getBounds().min.x).toBeCloseTo(prose.getBounds().min.x);
    expect(prose.getLineCount()).toBeGreaterThan(1);
    expect(prose.getBounds().max.x).toBeLessThan(diagram.getBounds().min.x);
    expect(diagram.children).toEqual([leftCircle, rightCircle]);
    expect(leftCircle.parent).toBe(diagram);
    expect(rightCircle.getCenter()[0]).toBeGreaterThan(leftCircle.getCenter()[0]);
    expect(prose.getSemanticTextRuns().every((run) => run.color === '#ff8800')).toBe(true);
    expect(DEFAULT_SLIDE_THEME.colors.accent).toBe('#58c4dd');
  });

  // MIGRATION: revealing a grouped descendant exposes exactly its ancestor path
  // and subtree, and a later show restores each descendant's authored opacity.
  it('reveals diagram children independently and restores a faded group', async () => {
    const player = makePlayer();
    const first = new Circle({ radius: 0.5 }).shift([-1, 0, 0]);
    first.opacity = 0.4;
    const second = new Circle({ radius: 0.5 }).shift([1, 0, 0]);
    const diagram = new VGroup(first, second);
    const definition = defineSlide(
      { title: 'Build a diagram', theme: { duration: 0.1 } },
      async (s) => {
        s.place(diagram);
        await s.step({ id: 'first' }, () => s.play(new Create(first, { duration: 0.1 })));
        await s.step({ id: 'move' }, () => s.play(diagram.animate.shift([1, 0, 0])));
        await s.step({ id: 'second' }, () => s.reveal(second));
        await s.step({ id: 'out' }, () => s.play(new FadeOut(diagram, { duration: 0.1 })));
        await s.step({ id: 'return-child' }, () => s.reveal(first));
        await s.step({ id: 'show' }, () => s.show(diagram));
      },
    );
    await player.sequence(definition.build);
    player.seekCheckpoint('first');
    expect(first.getThreeObject().visible).toBe(true);
    expect(second.getThreeObject().visible).toBe(false);
    player.seekCheckpoint('move');
    expect(second.getThreeObject().visible).toBe(false);
    player.seekCheckpoint('second');
    expect(second.getThreeObject().visible).toBe(true);
    player.seekCheckpoint('out');
    expect(player.scene.mobjects.has(diagram)).toBe(false);
    player.seekCheckpoint('return-child');
    expect(player.scene.mobjects.has(diagram)).toBe(true);
    expect(first.opacity).toBe(0.4);
    expect(second.opacity).toBe(0);
    player.seekCheckpoint('show');
    expect(player.scene.mobjects.has(diagram)).toBe(true);
    expect(first.opacity).toBe(0.4);
    expect(second.opacity).toBe(1);
  });

  // MIGRATION: declared transform destinations remain absent during the morph,
  // enter with their authored visibility at completion, and restore on any seek.
  it('reveals declared replacement targets only when their transform completes', async () => {
    const player = makePlayer();
    let source!: MathTex;
    let replacement!: MathTex;
    let matching!: MathTex;
    const definition = defineSlide({ title: 'Replace a formula' }, async (s) => {
      const equation = s.slot();
      source = equation.math('x');
      replacement = equation.math('y');
      matching = equation.math('z');
      await s.step({ id: 'source' }, () => s.show(source));
      await s.step({ id: 'replace' }, () =>
        s.play(new ReplacementTransform(source, replacement, { duration: 0.2 })),
      );
      await s.step({ id: 'match' }, () =>
        s.play(new TransformMatchingTex(replacement, matching, { duration: 0.2 })),
      );
    });
    await player.sequence(definition.build);
    player.seekCheckpoint('source');
    expect(replacement.getThreeObject().visible).toBe(false);
    player.seek(0.1);
    expect(player.scene.mobjects.has(replacement)).toBe(false);
    player.seekCheckpoint('replace');
    expect(player.scene.mobjects.has(replacement)).toBe(true);
    expect(player.inspectText().some((run) => run.text === 'y')).toBe(true);
    player.seekCheckpoint('match');
    expect(player.scene.mobjects.has(matching)).toBe(true);
    expect(player.inspectText().some((run) => run.text === 'z')).toBe(true);
    player.seekCheckpoint('source');
    expect(matching.getThreeObject().visible).toBe(false);
    player.seekCheckpoint('match');
    expect(player.inspectText().some((run) => run.text === 'z')).toBe(true);
  });

  // MIGRATION: invalid layout never silently clips or changes font sizes, and
  // layout declarations cannot mutate positions after recording has started.
  it('rejects overflow and late declarations with actionable errors', async () => {
    const player = makePlayer();
    const overflow = defineSlide({ title: 'Overflow' }, async (s) => {
      const objects = Array.from({ length: 12 }, () => s.paragraph('Another line.'));
      await s.step({ id: 'too-much' }, () => s.reveal(...objects));
    });
    await expect(player.sequence(overflow.build)).rejects.toThrow('available height');
    const other = makePlayer();
    const late = defineSlide({ title: 'Late content' }, async (s) => {
      const first = s.paragraph('First line.');
      await s.step({ id: 'first' }, () => s.reveal(first));
      s.paragraph('This would move earlier content.');
    });
    await expect(other.sequence(late.build)).rejects.toThrow('before the first step');
  });
});
