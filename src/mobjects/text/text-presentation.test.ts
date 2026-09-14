// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from './Text';
import { Paragraph } from './Paragraph';
import { MarkupText } from './MarkupText';
import { Group } from '../../core/Group';
import { Transform } from '../../animation/transform/Transform';
import { MeshBasicMaterial } from 'three';
import { AddTextLetterByLetter, RemoveTextLetterByLetter } from '../../animation/creation/Create';
import { AddTextWordByWord } from '../../animation/creation/CreationExtensions';
import { splitTexGroups, textGraphemes } from './TextSemantics';

vi.mock('./TextGlyphGroup', () => ({
  TextGlyphGroup: class {
    dispose = vi.fn();
    waitForReady = async () => {};
  },
}));

let fillText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fillText = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: textGraphemes(text).length * 10 }),
    clearRect: vi.fn(),
    fillText,
    strokeText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => vi.restoreAllMocks());

describe('presentation text', () => {
  // MIGRATION: every restored text state renders from its own logical canvas, independent of morph targets.
  it('keeps transformed textures independent when checkpoints restore source and target labels', () => {
    const source = new Text({ text: 'Order = 0' });
    const one = new Text({ text: 'Order = 1' });
    const two = new Text({ text: 'Order = 2' });
    source.getThreeObject();
    one.getThreeObject();
    two.getThreeObject();
    const original = source.captureState();
    const first = new Transform(source, one);
    first.begin();
    first.interpolate(1);
    first.finish();
    const second = new Transform(source, two);
    second.begin();
    second.interpolate(1);
    second.finish();
    const completed = source.captureState();
    const canvas = (text: Text) =>
      (text.getDisplayMeshes()[0].material as MeshBasicMaterial).map!.image as HTMLCanvasElement;
    expect(canvas(source)).not.toBe(canvas(one));
    expect(canvas(source)).not.toBe(canvas(two));
    source.restoreCapturedState(original);
    expect(fillText.mock.lastCall?.[0]).toBe('Order = 0');
    source.restoreCapturedState(completed);
    expect(fillText.mock.lastCall?.[0]).toBe('Order = 2');
    expect(source.getText()).toBe('Order = 2');
    expect(canvas(source)).not.toBe(canvas(two));
    expect(two.getText()).toBe('Order = 2');
  });
  // MIGRATION: any reveal boundary preserves complete graphemes, source and final layout.
  it('reveals and removes graphemes without moving the text or changing its source', () => {
    const source = 'e\u0301 👩🏽‍💻 Z';
    const text = new Text({ text: source, textAlign: 'center' });
    const originalWidth = text.getWidth();
    const originalHeight = text.getHeight();
    const add = new AddTextLetterByLetter(text, { timePerChar: 0.2 });
    expect(add.duration).toBe(1);
    add.begin();
    add.interpolate(0.6);
    expect(text.getVisibleText()).toBe('e\u0301 👩🏽‍💻');
    expect(text.getText()).toBe(source);
    expect([text.getWidth(), text.getHeight()]).toEqual([originalWidth, originalHeight]);
    expect(fillText.mock.lastCall?.[0]).toBe('e\u0301 👩🏽‍💻');
    const run = text.getSemanticTextRuns()[0];
    expect(run.text).toBe(text.getVisibleText());
    expect(run.sourceRange).toEqual([0, 'e\u0301 👩🏽‍💻'.length]);
    expect(run.bounds.x).toBeLessThan(0);
    add.interpolate(0.2);
    expect(text.getVisibleText()).toBe('e\u0301');
    expect(text.getSemanticTextRuns()[0].id).toBe(run.id);
    add.finish();
    const remove = new RemoveTextLetterByLetter(text);
    remove.begin();
    remove.interpolate(0.4);
    expect(text.getVisibleText()).toBe('e\u0301 👩🏽‍💻');
    remove.finish();
    expect(text.getText()).toBe(source);
    expect(text.getSemanticTextRuns().every((part) => !part.visible)).toBe(true);
  });

  // MIGRATION: every word prefix is an exact prefix of the original whitespace-preserving source.
  it('preserves spaces, tabs and line boundaries throughout word animation and state restoration', () => {
    const source = '  alpha\t\t beta\n gamma  ';
    const text = new Text({ text: source });
    const words = new AddTextWordByWord(text);
    expect(words.duration).toBeCloseTo(0.6);
    words.begin();
    words.interpolate(2 / 3);
    expect(text.getVisibleText()).toBe('  alpha\t\t beta\n ');
    const state = text.captureState();
    words.finish();
    text.restoreCapturedState(state);
    expect(text.getVisibleText()).toBe('  alpha\t\t beta\n ');
    expect(
      text
        .getSemanticTextRuns()
        .filter((run) => run.visible)
        .map((run) => run.text),
    ).toEqual(['  alpha\t\t beta', ' ']);
  });

  // MIGRATION: a glyph cache can only be reused for the content and style that produced it.
  it('invalidates loaded glyphs when content, font metrics or color change', async () => {
    const text = new Text({ text: 'old', fontUrl: '/font.ttf' });
    await text.loadGlyphs();
    expect(text.getGlyphGroup()).not.toBeNull();
    const prepared = text.getGlyphGroup();
    const saved = text.captureState();
    fillText.mockClear();
    text.restoreCapturedState(saved);
    text.restoreCapturedState(saved);
    expect(text.getGlyphGroup()).toBe(prepared);
    expect(fillText).not.toHaveBeenCalled();
    text.setText('new');
    expect(text.getGlyphGroup()).toBeNull();
    await text.loadGlyphs();
    text.setFontSize(72);
    expect(text.getGlyphGroup()).toBeNull();
    await text.loadGlyphs();
    text.color = '#00ff00';
    expect(text.getGlyphGroup()).toBeNull();
  });

  // MIGRATION: nested TeX syntax inside explicit token braces survives token extraction.
  it('preserves explicit TeX units and repeated token boundaries', () => {
    expect(splitTexGroups('{{x}} + {{\\frac{a}{b}}} + {{x}}')).toEqual([
      'x',
      ' + ',
      '\\frac{a}{b}',
      ' + ',
      'x',
    ]);
  });

  // MIGRATION: styled and wrapped layouts preserve their source and expose only rendered graphemes.
  it('reveals styled prose and wrapped paragraphs without exposing markup or hidden words', () => {
    const markup = new MarkupText({ text: '<b>e\u0301</b> <i>👩🏽‍💻</i> hidden' });
    const animation = new AddTextLetterByLetter(markup);
    animation.begin();
    animation.interpolate(3 / textGraphemes(markup.getTextContent()).length);
    expect(markup.getVisibleText()).toBe('e\u0301 👩🏽‍💻');
    expect(
      markup
        .getSemanticTextRuns()
        .filter((run) => run.visible)
        .map((run) => run.text)
        .join(''),
    ).toBe('e\u0301 👩🏽‍💻');
    expect(markup.getSemanticTextRuns()[0].font.weight).toBe('bold');
    const parent = new Group(markup);
    parent.shift([2, 1, 0]);
    expect(markup.getSemanticTextRuns()[0].matrixWorld.slice(12, 14)).toEqual([2, 1]);
    const paragraph = new Paragraph({ text: 'alpha  beta gamma', width: 0.4 });
    const wordAnimation = new AddTextWordByWord(paragraph);
    const height = paragraph.getHeight();
    wordAnimation.begin();
    wordAnimation.interpolate(1 / 3);
    expect(paragraph.getVisibleText()).toBe('alpha  ');
    expect(
      paragraph
        .getSemanticTextRuns()
        .filter((run) => run.visible)
        .map((run) => run.text)
        .join(''),
    ).toBe('alpha  ');
    expect(paragraph.getHeight()).toBe(height);
  });
});
