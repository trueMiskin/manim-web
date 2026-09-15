// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { RichParagraph } from './RichParagraph';
import { MathTex } from './MathTex';
import { ParagraphMathRun, ParagraphTextRun, parseInlineSource } from './RichParagraphRuns';
import { prepareMobjects } from '../../core/readiness';
import { Write } from '../../animation/creation/Create';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => createCanvas(512, 512).getContext('2d') as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => vi.restoreAllMocks());

describe('RichParagraph', () => {
  // MIGRATION: inline prose and math retain source order, share a baseline and
  // preserve literal dollars, whitespace and explicit line boundaries.
  it('lays out selectable prose and real formula vectors on a shared baseline', async () => {
    const source = String.raw`Choose  $\eta > 0$. Cost: \$5.` + '\n\nRepeat.\n';
    const paragraph = new RichParagraph({ text: source, width: 6, fontSize: 28 });
    const originalChildren = [...paragraph.children];
    await prepareMobjects([paragraph]);
    expect(paragraph.children).toEqual(originalChildren);
    expect(paragraph.getText()).toBe(source);
    expect(paragraph.getLineCount()).toBe(4);
    const runs = paragraph.getSemanticTextRuns();
    expect(runs.map((run) => run.text).join('')).toBe('Choose  \\eta > 0. Cost: $5.Repeat.');
    expect(runs.filter((run) => run.kind === 'math')).toHaveLength(1);
    const math = paragraph.children.find(
      (child): child is ParagraphMathRun => child instanceof ParagraphMathRun,
    )!;
    const text = paragraph.children[0] as ParagraphTextRun;
    const display = new MathTex({ latex: String.raw`\eta > 0`, fontSize: 28 });
    await display.waitForRender();
    expect(math.children).toHaveLength(3);
    const mathBounds = math.getBounds();
    const displayBounds = display.getBounds();
    expect(mathBounds.max.x - mathBounds.min.x).toBeCloseTo(
      displayBounds.max.x - displayBounds.min.x,
      6,
    );
    expect(math.position.y + math.measureInline().baseline).toBeCloseTo(
      text.position.y + text.measureInline().baseline,
      6,
    );
    const bounds = paragraph.getBounds();
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(6);
    expect(parseInlineSource(String.raw`price \$7, unmatched $`)).toEqual([
      { kind: 'text', text: 'price' },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: '$7,' },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: 'unmatched' },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: '$' },
    ]);
  });

  // MIGRATION: wrapping respects the configured width; repeated readiness and
  // prepared/pending copies preserve the transformed geometry and child count.
  it('wraps without rebuilding and keeps pending copies and transformed copies stable', async () => {
    const paragraph = new RichParagraph({
      text: String.raw`Take a step $x_{k+1}=x_k-\eta g_k$. Then repeat.`,
      width: 8,
      fontSize: 24,
    });
    paragraph.setWidth(2.4);
    const pendingCopy = paragraph.copy();
    await prepareMobjects([paragraph, pendingCopy]);
    expect(paragraph.getLineCount()).toBeGreaterThan(1);
    expect(paragraph.getBounds().max.x - paragraph.getBounds().min.x).toBeLessThanOrEqual(2.4);
    expect(pendingCopy.getBounds()).toEqual(paragraph.getBounds());
    paragraph.scale(1.4).shift([1, -2, 0]).normalizeTransform();
    const bounds = paragraph.getBounds();
    const copied = paragraph.copy();
    const children = [...paragraph.children];
    await prepareMobjects([paragraph, copied]);
    expect(paragraph.children).toEqual(children);
    expect(paragraph.getBounds()).toEqual(bounds);
    expect(copied.getBounds()).toEqual(bounds);
    expect(() => paragraph.setWidth(4)).toThrow('before preparing');
    const tooNarrow = new RichParagraph({ text: '$abcdefgh$', width: 0.2 });
    await expect(tooNarrow.waitForRender()).rejects.toThrow('exceeds width');
  });

  // MIGRATION: every Write progress preserves authored source, final positions
  // and bounds while revealing prose graphemes and math in reading order.
  it('writes mixed content without changing its final layout or copying hidden content as visible', async () => {
    const paragraph = new RichParagraph({ text: 'Start $x$ end.', width: 4, fontSize: 24 });
    await paragraph.waitForRender();
    const bounds = paragraph.getBounds();
    const write = new Write(paragraph);
    write.begin();
    expect(paragraph.getSemanticTextRuns().every((run) => !run.visible)).toBe(true);
    write.interpolate(0.5);
    const copy = paragraph.copy();
    await prepareMobjects([copy]);
    expect(copy.getSemanticTextRuns().map((run) => [run.text, run.visible])).toEqual(
      paragraph.getSemanticTextRuns().map((run) => [run.text, run.visible]),
    );
    copy.setRevealProgress(1);
    expect(copy.getSemanticTextRuns().every((run) => run.visible)).toBe(true);
    expect(paragraph.getBounds()).toEqual(bounds);
    write.finish();
    expect(
      paragraph
        .getSemanticTextRuns()
        .map((run) => run.text)
        .join(''),
    ).toBe('Start x end.');
    expect(paragraph.getSemanticTextRuns().every((run) => run.visible)).toBe(true);
    expect(paragraph.getBounds()).toEqual(bounds);
    expect(paragraph.getText()).toBe('Start $x$ end.');
  });
});
