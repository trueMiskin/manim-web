// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { SlideRegion } from './slideBlocks';
import { SlideLayout } from './slideLayout';
import { DEFAULT_SLIDE_THEME } from './slideTheme';
import { RichParagraph } from '../mobjects/text/RichParagraph';
import { ParagraphMathRun, ParagraphTextRun } from '../mobjects/text/RichParagraphRuns';
import { prepareMobjects } from '../core/readiness';
import { Line } from '../mobjects/geometry/Line';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => createCanvas(512, 512).getContext('2d') as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => vi.restoreAllMocks());

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
  const baseline = () => ({
    marker: marker._localToWorld([0, marker.measureInline().baseline, 0])[1],
    formula: formula._localToWorld([0, formula.measureInline().baseline, 0])[1],
  });
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
