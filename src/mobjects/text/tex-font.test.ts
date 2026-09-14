// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tex } from './Tex';
import { Text } from './Text';
import { TextGlyphGroup } from './TextGlyphGroup';
import { Write } from '../../animation/creation/Create';
import { TransformMatchingTex } from '../../animation/transform/TransformMatching';
import { serializeMobject, deserializeMobject } from '../../core/StateManager';

const fontUrl = '/fonts/DroidSans.ttf';
const font = readFileSync(
  resolve(__dirname, '../../../examples/presentations/tech-demo/assets/fonts/DroidSans.ttf'),
);
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () =>
        font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength),
    })),
  ),
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('literal Tex font outlines', () => {
  // MIGRATION: glyph geometry, matching identities and copy text survive readiness,
  // keyed reordering, state restoration and both early and settled copies.
  it('retains repeated parts, source ranges, font assets and keyed destinations', async () => {
    const source = new Tex({
      latex: '{{Ray}} {{Ray}}',
      matchingKeys: ['left', 'space', 'right'],
      fontUrl,
      color: '#00ffff',
    });
    source.scale(1.5).moveTo([-2, 1, 0]);
    const earlyCopy = source.copy();
    const target = new Tex({
      latex: '{{Ray}} {{Ray}}',
      matchingKeys: ['right', 'space', 'left'],
      fontUrl,
    }).moveTo([2, -1, 0]);
    await Promise.all([source.waitForRender(), earlyCopy.waitForRender(), target.waitForRender()]);
    expect(source.getWidth()).toBeCloseTo(target.getWidth() * 1.5);
    expect(earlyCopy.getWidth()).toBeCloseTo(source.getWidth());
    expect(source.getCenter()).toEqual([-2, 1, 0]);
    const glyph = source.getPart(0).children[0] as import('./GlyphVMobject').GlyphVMobject;
    expect(glyph.getSubpathLengths()!.length).toBeGreaterThan(1);
    expect(glyph.getSubpathLengths()!.reduce((sum, value) => sum + value, 0)).toBe(
      glyph.getLocalPoints().length,
    );
    const runs = source.getSemanticTextRuns();
    expect(runs.map((run) => run.text).join('')).toBe('Ray Ray');
    expect(runs.every((run) => run.kind === 'text' && run.font.url === fontUrl)).toBe(true);
    expect(runs.every((run) => run.source.slice(...run.sourceRange) === run.text)).toBe(true);
    expect(runs[1].bounds.width).toBeGreaterThan(0);
    const copy = source.copy();
    await copy.waitForRender();
    expect(
      copy.getSemanticTextRuns().map(({ text, font: runFont }) => ({ text, runFont })),
    ).toEqual(runs.map(({ text, font: runFont }) => ({ text, runFont })));
    const initial = serializeMobject(source);
    const destination = target.getPart(2).getCenter();
    const matching = new TransformMatchingTex(source, target);
    matching.begin();
    matching.interpolate(1);
    expect(source.getPart(0).getCenter()[0]).toBeCloseTo(destination[0]);
    matching.reset();
    deserializeMobject(source, initial);
    expect(source.getSemanticTextRuns()).toEqual(runs);
    const write = new Write(source);
    write.begin();
    write.interpolate(0.25);
    expect(source.fillOpacity).toBe(0);
    write.reset();
    deserializeMobject(source, initial);
    write.begin();
    write.interpolate(1);
    write.finish();
    expect(source.fillOpacity).toBe(1);
    expect(source.strokeWidth).toBe(initial.style.strokeWidth);
    expect(source.getSemanticTextRuns()).toEqual(runs);
  });

  // MIGRATION: explicit font files never silently substitute TeX or missing glyphs.
  it('rejects unsupported source and glyphs', async () => {
    expect(() => new Tex({ latex: String.raw`\frac{x}{y}`, fontUrl })).toThrow('literal Latin');
    const missing = new TextGlyphGroup({ text: '🙂', fontUrl, strictGlyphs: true });
    await expect(missing.waitForReady()).rejects.toThrow('has no glyph');
  });

  // MIGRATION: partial Text writing leaves no temporary outline attachment on reset.
  it('restores the real-font texture and glyph cache after interrupted writing', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 10 }),
      clearRect: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const text = new Text({ text: 'Optical Lens Design', fontUrl, fontSize: 24 });
    await text.waitForRender();
    await text.loadGlyphs();
    const glyphs = text.getGlyphGroup();
    expect(glyphs).not.toBeNull();
    text.getThreeObject();
    const texture = text.getTextureMesh();
    const write = new Write(text);
    const initialChildren = [...text.getThreeObject().children];
    let outlinePosition: number[] | undefined;
    for (let pass = 0; pass < 3; pass++) {
      write.begin();
      write.interpolate(0.4);
      const position = glyphs!.getThreeObject().position.toArray();
      if (outlinePosition) expect(position).toEqual(outlinePosition);
      else outlinePosition = position;
      expect(texture?.visible).toBe(false);
      expect(glyphs?.getThreeObject().parent).toBe(text.getThreeObject());
      write.reset();
      expect(texture?.visible).toBe(true);
      expect(text.getThreeObject().children).toEqual(initialChildren);
      expect(text.getGlyphGroup()).toBe(glyphs);
    }
  });
});
