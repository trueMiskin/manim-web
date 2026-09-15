// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { Text } from './Text';

class InspectableText extends Text {
  raster(): { canvas: HTMLCanvasElement; font: string } {
    return { canvas: this._canvas!, font: this._buildFontString() };
  }
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => createCanvas(512, 512).getContext('2d') as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => vi.restoreAllMocks());

// MIGRATION: every line's full ink and stroke fit inside the raster with bottom
// padding, independently of the chosen line advance or font's descent metrics.
it('reserves descender ink without changing authored line spacing or semantic text', async () => {
  const source = 'gypq\nfg';
  const fontSize = 28;
  const strokeWidth = 1.5;
  const text = new InspectableText({
    text: source,
    fontFamily: 'Arial',
    fontSize,
    lineHeight: 1,
    strokeWidth,
  });
  await text.waitForRender();
  const { canvas, font } = text.raster();
  const context = createCanvas(512, 512).getContext('2d');
  context.font = font;
  context.textBaseline = 'top';
  const padding = fontSize * 2 * 0.2;
  const lineAdvance = fontSize * 2;
  for (const [index, line] of source.split('\n').entries()) {
    const inkBottom =
      padding + index * lineAdvance + context.measureText(line).actualBoundingBoxDescent;
    expect(inkBottom + strokeWidth + padding).toBeLessThanOrEqual(canvas.height);
  }
  const runs = text.getSemanticTextRuns();
  expect(runs.map((run) => run.text)).toEqual(source.split('\n'));
  const pixelsToWorld = text.getHeight() / canvas.height;
  expect(runs[0].bounds.y - runs[1].bounds.y).toBeCloseTo(lineAdvance * pixelsToWorld, 8);
  expect(runs.every((run) => run.font.lineHeight === 1)).toBe(true);
  text.dispose();
});
