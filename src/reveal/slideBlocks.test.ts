// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { SlideRegion } from './slideBlocks';
import { SlideLayout } from './slideLayout';
import { DEFAULT_SLIDE_THEME } from './slideTheme';
import { RichParagraph } from '../mobjects/text/RichParagraph';
import { ParagraphMathRun, ParagraphTextRun } from '../mobjects/text/RichParagraphRuns';
import { prepareMobjects } from '../core/readiness';
import { Line } from '../mobjects/geometry/Line';
import { Circle } from '../mobjects/geometry/Circle';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => createCanvas(512, 512).getContext('2d') as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => vi.restoreAllMocks());

// MIGRATION: a slot reserves the largest alternative once, while compound
// alternatives keep their internal flow and captions retain their font size.
it('keeps bullet lists and captioned figures intact inside a replacement slot', async () => {
  const title = new RichParagraph({ text: 'Alternatives', width: 12, fontSize: 40 });
  const layout = new SlideLayout(14, 8, DEFAULT_SLIDE_THEME, title);
  const region = new SlideRegion(layout, layout.root).columns()[0];
  const slot = region.slot();
  const intro = slot.paragraph('A figure follows.');
  const bullets = slot.bullets(['First observation.', 'Second observation.']);
  const diagram = new Circle({ radius: 5 });
  const { caption } = slot.figure(diagram, {
    height: 2,
    caption: 'The caption wraps beneath the graphic and keeps its original font size.',
  });
  const footer = region.paragraph('Outside the slot.');
  await layout.prepare();

  expect(diagram.getBounds().max.x - diagram.getBounds().min.x).toBeCloseTo(2);
  expect(intro.getBounds().max.y).toBeCloseTo(diagram.getBounds().max.y);
  expect(bullets.item(0).getBounds().max.y).toBeCloseTo(intro.getBounds().max.y);
  expect(bullets.item(0).getBounds().min.y).toBeGreaterThan(bullets.item(1).getBounds().max.y);
  expect(caption.getBounds().max.y).toBeCloseTo(
    diagram.getBounds().min.y - DEFAULT_SLIDE_THEME.captionGap,
  );
  expect(caption.getLineCount()).toBeGreaterThan(1);
  expect(
    caption.getSemanticTextRuns().every((run) => run.font.size === DEFAULT_SLIDE_THEME.captionSize),
  ).toBe(true);
  expect(caption.scaleVector.toArray()).toEqual([1, 1, 1]);
  expect(diagram.parent).toBeNull();
  expect(caption.parent).toBeNull();
  expect(footer.getBounds().max.y).toBeCloseTo(caption.getBounds().min.y - DEFAULT_SLIDE_THEME.gap);
  expect(() => slot.paragraph('Too late.')).toThrow('before the first step');
  for (const object of [title, intro, ...bullets.items, diagram, caption, footer]) object.dispose();
});

// MIGRATION: contain placement keeps every nonempty graphic inside its region,
// including geometry with a zero extent along either layout dimension.
it('fits an over-wide horizontal line without a reserved height', async () => {
  const title = new RichParagraph({ text: 'A divider', width: 12, fontSize: 40 });
  const layout = new SlideLayout(14, 8, DEFAULT_SLIDE_THEME, title);
  const region = new SlideRegion(layout, layout.root).columns([1, 1])[0];
  const line = region.place(new Line({ start: [-10, 0, 0], end: [10, 0, 0] }));
  await layout.prepare();
  const bounds = line.getBounds();
  const left = -7 + DEFAULT_SLIDE_THEME.margin;
  const width = (14 - 2 * DEFAULT_SLIDE_THEME.margin - DEFAULT_SLIDE_THEME.columnGap) / 2;
  expect(bounds.min.x).toBeCloseTo(left);
  expect(bounds.max.x).toBeCloseTo(left + width);
  expect(bounds.min.y).toBe(bounds.max.y);
  expect([...line.getStart(), ...line.getEnd()].every(Number.isFinite)).toBe(true);
  line.dispose();
  title.dispose();
});

// MIGRATION: code fits its column after font preparation, keeps source and
// monospace typography independent of prose, and follows the resolved palette.
it('lays out themed code beside prose with selectable source and optional controls', async () => {
  const title = new RichParagraph({ text: 'Code and explanation', width: 12, fontSize: 40 });
  const theme = { ...DEFAULT_SLIDE_THEME, fontFamily: 'serif', bodySize: 30 };
  const layout = new SlideLayout(14, 8, theme, title);
  const [left, right] = new SlideRegion(layout, layout.root).columns();
  const source = 'return value * 2; // A long line should shrink without wrapping the source.';
  const sample = left.code(source, { language: 'cpp', lineNumbers: false, copyButton: false });
  const explanation = right.paragraph('The input is doubled.');
  await layout.prepare();
  const bounds = sample.getBounds();
  const leftEdge = -7 + theme.margin;
  const columnWidth = (14 - 2 * theme.margin - theme.columnGap) / 2;
  expect(bounds.min.x).toBeCloseTo(leftEdge);
  expect(bounds.max.x).toBeCloseTo(leftEdge + columnWidth);
  expect(bounds.max.x).toBeLessThan(explanation.getBounds().min.x);
  expect(sample.getSemanticTextRuns()[0]).toMatchObject({
    source,
    text: source,
    color: theme.colors.text,
    font: { family: 'monospace', size: theme.bodySize },
    code: { copyButton: false, lineCount: 1 },
  });
  expect(sample.getCode()).toBe(source);
  expect(() => left.code('too late')).toThrow('before the first step');
  for (const object of [title, sample, explanation]) object.dispose();
});

// MIGRATION: bullet markers share their first line's baseline independently of
// formula height, wrapping and repeated font preparation.
it('aligns the bullet baseline with a tall first-line formula', async () => {
  const title = new RichParagraph({ text: 'Fractions', width: 12, fontSize: 40 });
  const layout = new SlideLayout(14, 8, DEFAULT_SLIDE_THEME, title);
  const region = new SlideRegion(layout, layout.root);
  const row = region.bullets([String.raw`$\dfrac{1}{\dfrac{x}{y}}$ describes the ratio.`]).item(0);
  await layout.prepare();
  const marker = row.children[0] as ParagraphTextRun;
  const content = row.children[1] as RichParagraph;
  const formula = content.children[0] as ParagraphMathRun;
  const worldY = (run: ParagraphTextRun | ParagraphMathRun) =>
    new THREE.Vector3(0, run.measureInline().baseline, 0).applyMatrix4(run._worldMatrix()).y;
  const baseline = () => ({ marker: worldY(marker), formula: worldY(formula) });
  expect(baseline().marker).toBeCloseTo(baseline().formula, 6);
  const bounds = row.getBounds();
  await prepareMobjects([row]);
  expect(row.getBounds()).toEqual(bounds);
  expect(baseline().marker).toBeCloseTo(baseline().formula, 6);
  row.dispose();
  title.dispose();
});

// MIGRATION: a row's bounds include every line of prose, including lines after
// the last formula, so following rows never intersect visible text.
it('includes wrapped prose below inline math when positioning the following bullet', async () => {
  const title = new RichParagraph({ text: 'Wrapping', width: 12, fontSize: 40 });
  const layout = new SlideLayout(14, 8, DEFAULT_SLIDE_THEME, title);
  const region = new SlideRegion(layout, layout.root).columns([1, 1])[0];
  const rows = region.bullets([
    String.raw`First, follow the negative gradient $-\nabla f(x)$ to move toward the nearest local minimum.`,
    'Second, repeat until the changes are small.',
  ]);
  await layout.prepare();
  const first = rows.item(0);
  const content = first.children[1] as RichParagraph;
  expect(content.getLineCount()).toBeGreaterThan(1);
  const lowestText = Math.min(...content.children.map((child) => child.getBounds().min.y));
  expect(first.getBounds().min.y).toBeLessThanOrEqual(lowestText);
  expect(lowestText).toBeGreaterThan(rows.item(1).getBounds().max.y);
  const center = content.getCenter();
  const bounds = content.getBounds();
  expect(center[1]).toBeCloseTo((bounds.min.y + bounds.max.y) / 2, 6);
  rows.items.forEach((row) => row.dispose());
  title.dispose();
});
