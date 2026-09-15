/** Text-mode TeX with semantic matching parts and optional font-file outlines. */

import { MathTex, MathTexOptions, isMathTexPart } from './MathTex';
import { splitTexGroups, textGraphemes, type SemanticTextRun } from './TextSemantics';
import { TextGlyphGroup } from './TextGlyphGroup';
import { fontFamilyForUrl, loadFontFace } from './TextFont';
import { DEFAULT_FONT_SIZE_IN_WORLD_SPACE, DEFAULT_FONT_SIZE_PT } from '../../constants/fontRender';

export interface TexOptions extends Omit<MathTexOptions, 'latex'> {
  /** Text-mode LaTeX string or array of strings for multi-part expressions. */
  latex: string | string[];
  /**
   * Render single-line literal text using this OTF/TTF's outlines.
   * Supports spaces and {{matching parts}}; TeX commands, control characters,
   * shaping-dependent scripts, and missing glyphs are rejected.
   * Omit to use the normal MathJax text-mode renderer.
   */
  fontUrl?: string;
  /** CSS descriptor for the supplied font file, also retained for printing. */
  fontWeight?: 'normal' | 'bold' | number;
}

/**
 * Tex - LaTeX rendering for manimweb
 *
 * Text-mode MathJax rendering by default. Supply fontUrl for literal Latin
 * titles whose glyph outlines must use the same font as ordinary Text.
 *
 * @example
 * ```typescript
 * // Create a formula (Manim-style API)
 * const formula = new Tex({ latex: 'x^2 + y^2 = r^2' });
 *
 * // Create with options
 * const colored = new Tex({
 *   latex: '\\frac{d}{dx}\\sin(x) = \\cos(x)',
 *   color: '#ffff00',
 * });
 * ```
 */
export class Tex extends MathTex {
  /** Original unwrapped latex, used by _copy to avoid double-wrapping */
  private _originalLatex: string | string[];
  private _fontUrl?: string;
  private _fontWeight: 'normal' | 'bold' | number;

  constructor(options: TexOptions, render = true) {
    // Wrap in \text{...} for text-mode rendering (upright serif, proper word spacing)
    // Split on \\ to handle line breaks, wrap each segment separately
    const wrap = (part: string) => {
      const lines = part.split('\\\\');
      return lines.map((line) => `\\text{${lines.length > 1 ? line.trim() : line}}`).join(' \\\\ ');
    };
    const parts = Array.isArray(options.latex) ? options.latex : splitTexGroups(options.latex);
    if (
      options.fontUrl &&
      parts.some(
        (part) =>
          /[^\p{Script=Latin}\p{Number} \p{Punctuation}+=<>|]/u.test(part) ||
          /[\\{}$^_&%#~]/u.test(part),
      )
    ) {
      throw new Error(
        'Tex.fontUrl supports single-line literal Latin text and {{matching parts}}; use MathTex for TeX commands.',
      );
    }
    const wrapped = parts.map(wrap);
    super(
      {
        ...options,
        latex: wrapped.length > 1 ? wrapped : wrapped[0],
        matchingKeys: options.matchingKeys ?? parts,
      },
      render && !options.fontUrl,
    );
    this._originalLatex = options.latex;
    this._fontUrl = options.fontUrl;
    this._fontWeight = options.fontWeight ?? 'normal';
    this._sourceLatex = Array.isArray(options.latex) ? options.latex.join('') : options.latex;
    if (this._fontUrl) {
      this._partLatex = parts;
      this._latex = parts.join('');
      this._isMultiPart =
        Array.isArray(options.latex) || parts.length > 1 || parts[0] !== options.latex;
      if (render)
        this._renderPromise = this._renderFontText().catch((error: unknown) => {
          this._renderError = error instanceof Error ? error : new Error(String(error));
        });
    }
  }

  private async _renderFontText(): Promise<void> {
    const fontUrl = this._fontUrl!;
    const glyphs = new TextGlyphGroup({
      text: this._latex,
      fontUrl,
      fontSize: this._fontSize,
      color: this._color,
      strokeWidth: this._svgStrokeWidth,
      strictGlyphs: true,
    });
    try {
      await Promise.all([
        glyphs.waitForReady(),
        loadFontFace(fontUrl, undefined, { weight: this._fontWeight, style: 'normal' }),
      ]);
      this._restyleChildren(glyphs);
      const ranges = glyphs.getGlyphRanges();
      const points = ranges.flatMap(({ glyph }) => glyph.getLocalPoints());
      if (points.length) {
        const minX = Math.min(...points.map((point) => point[0]));
        const maxX = Math.max(...points.map((point) => point[0]));
        const minY = Math.min(...points.map((point) => point[1]));
        const maxY = Math.max(...points.map((point) => point[1]));
        const scale =
          this._targetHeight !== undefined && maxY > minY
            ? this._targetHeight / (maxY - minY)
            : (100 * DEFAULT_FONT_SIZE_IN_WORLD_SPACE) / DEFAULT_FONT_SIZE_PT;
        for (const { glyph } of ranges)
          glyph.setPoints3D(
            glyph
              .getLocalPoints()
              .map((point) => [
                (point[0] - (minX + maxX) / 2) * scale,
                (point[1] - (minY + maxY) / 2) * scale,
                point[2],
              ]),
          );
      }
      let offset = 0;
      for (let index = 0; index < this._partLatex.length; index++) {
        const text = this._partLatex[index];
        const part = this._isMultiPart ? this._createPart(text, this._matchingKeys[index]) : null;
        const owner = part ?? this;
        for (const range of ranges)
          if (range.start >= offset && range.start < offset + text.length) {
            glyphs.remove(range.glyph);
            owner.add(range.glyph);
          }
        offset += text.length;
        if (part) {
          this._parts.push(part);
          this.add(part);
        }
      }
      this._consumePendingScale();
      this.fillOpacity = this._svgFillOpacity;
    } finally {
      glyphs.dispose();
    }
  }

  override captureState(): Record<string, unknown> {
    return {
      ...super.captureState(),
      originalLatex: this._originalLatex,
      fontUrl: this._fontUrl ?? null,
      fontWeight: this._fontWeight,
    };
  }

  override restoreCapturedState(state: Record<string, unknown>): void {
    super.restoreCapturedState(state);
    if (typeof state.originalLatex === 'string') this._originalLatex = state.originalLatex;
    else if (Array.isArray(state.originalLatex))
      this._originalLatex = state.originalLatex.map(String);
    if (typeof state.fontUrl === 'string') this._fontUrl = state.fontUrl;
    else if (state.fontUrl === null) this._fontUrl = undefined;
    if (
      state.fontWeight === 'normal' ||
      state.fontWeight === 'bold' ||
      typeof state.fontWeight === 'number'
    )
      this._fontWeight = state.fontWeight;
  }

  override getSemanticTextRuns(): SemanticTextRun[] {
    const runs = super.getSemanticTextRuns();
    if (!this._fontUrl) return runs;
    let sourceOffset = 0;
    return runs.map((run, index) => {
      const start = this._sourceLatex.indexOf(run.text, sourceOffset);
      sourceOffset = start + run.text.length;
      // Space-only matching parts still occupy selectable source layout.
      if (!run.text.trim() && index > 0 && index + 1 < runs.length) {
        const before = runs[index - 1].bounds;
        const after = runs[index + 1].bounds;
        run.bounds = {
          x: before.x + before.width,
          y: before.y,
          width: Math.max(0, after.x - before.x - before.width),
          height: before.height,
        };
      }
      return {
        ...run,
        kind: 'text',
        source: this._sourceLatex,
        sourceRange: [start, sourceOffset],
        graphemeRange: [
          textGraphemes(this._latex.slice(0, run.sourceRange[0])).length,
          textGraphemes(this._latex.slice(0, run.sourceRange[1])).length,
        ],
        font: {
          ...run.font,
          family: `'${fontFamilyForUrl(this._fontUrl!)}'`,
          url: this._fontUrl,
          weight: this._fontWeight,
          bounds: 'ink',
        },
      };
    });
  }

  override copy(): Tex {
    const copy = new Tex(
      {
        latex: this._originalLatex,
        color: this._color,
        fontSize: this._fontSize,
        displayMode: this._displayMode,
        position: [this.position.x, this.position.y, this.position.z],
        strokeWidth: this._svgStrokeWidth,
        fillOpacity: this._svgFillOpacity,
        height: this._targetHeight,
        macros: this._macros,
        matchingKeys: this._matchingKeys,
        fontUrl: this._fontUrl,
        fontWeight: this._fontWeight,
      },
      false,
    );
    this._copyBaseAttributesInto(copy, { copyChildren: true });
    copy._parts = this._isMultiPart
      ? copy.children.filter(isMathTexPart)
      : [];
    if (this.children.length === 0 && this._renderPromise) {
      const pendingScale = this.scaleVector.clone();
      copy._renderPromise = this.waitForRender().then(() => {
        // Source readiness baked its pending scale into the copied geometry.
        copy.scaleVector.set(
          copy.scaleVector.x / (pendingScale.x || 1),
          copy.scaleVector.y / (pendingScale.y || 1),
          copy.scaleVector.z / (pendingScale.z || 1),
        );
        for (const child of this.children) copy.add(child.copy());
        copy._parts = this._isMultiPart
          ? copy.children.filter(isMathTexPart)
          : [];
      });
    }
    return copy;
  }
}
