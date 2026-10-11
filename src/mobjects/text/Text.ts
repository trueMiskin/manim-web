import * as THREE from 'three';
import { Vector3Tuple } from '../../core/Mobject';
import { TexturedMobject } from '../../core/TexturedMobject';
import { TextGlyphGroup } from './TextGlyphGroup';
import { loadFontFace } from './TextFont';
import { canvasSemanticRuns, textGraphemes, type SemanticTextRun } from './TextSemantics';
import type { SkeletonizeOptions } from '../../utils/skeletonize';
import { DEFAULT_FONT_SIZE_PT, DEFAULT_FONT_SIZE_IN_WORLD_SPACE } from '../../constants/fontRender';
import {
  type TextStyleMaps,
  type TextStyleRun,
  type StyledTextParams,
  buildStyledTextLines,
  gradientIsActive,
  hasStyleMaps,
  measureStyledText,
  renderStyledTextToCanvas,
} from './textStyleRuns';

/** Scale factor from Canvas 2D output to point units.
 * At 72 DPI, 1pt = 4/3 canvas pixels. */
const SVG_UNITS_PER_PT = 4 / 3;

/**
 * Options for creating a Text mobject
 */
export interface TextOptions {
  /** The text content to display */
  text: string;
  /** Font size in points. Default: 48 */
  fontSize?: number;
  /** Font family. Default: 'CMU Serif, Georgia, Times New Roman, serif' (Manim-like) */
  fontFamily?: string;
  /** Font weight. Default: 'normal' */
  fontWeight?: string | number;
  /** Font style ('normal' | 'italic'). Default: 'normal' */
  fontStyle?: string;
  /** Text color as CSS color string. Default: '#ffffff' */
  color?: string;
  /** Fill opacity from 0 to 1. Default: 1 */
  fillOpacity?: number;
  /** Stroke width for outlined text. Default: 0 */
  strokeWidth?: number;
  /** Line height multiplier. Default: 1.2 */
  lineHeight?: number;
  /** Letter spacing in pixels. Default: 0 */
  letterSpacing?: number;
  /** Text alignment. Default: 'center' */
  textAlign?: 'left' | 'center' | 'right';
  /** URL to a font file (OTF/TTF) for glyph vector extraction. When provided, loadGlyphs() can extract glyph outlines for stroke-draw animation. */
  fontUrl?: string;
  /** Per-substring color map (text-to-color), as in Manim CE. Colors every occurrence of each substring. */
  t2c?: Record<string, string>;
  /** Per-substring font-weight map (text-to-weight), e.g. { bold: 'bold' }. */
  t2w?: Record<string, string | number>;
  /** Per-substring font-style map (text-to-slant), e.g. { x: 'italic' }. */
  t2s?: Record<string, string>;
  /**
   * Linear color gradient fill, as in Manim CE `Text(..., gradient=(A, B, ...))`.
   * Provide 2+ CSS colors. The text fills with a horizontal left-to-right
   * gradient that spans its rendered box, with the colors evenly spaced across
   * [0, 1]. The gradient takes precedence over the flat `color`. It composes
   * with `t2c`: a substring colored by `t2c` keeps that color, and only the
   * remaining (un-colored) characters take the gradient.
   */
  gradient?: string[];
}

/** Resolution multiplier for crisp text on retina displays */
const RESOLUTION_SCALE = 2;

/**
 * Text - A text mobject rendered using Canvas 2D to a texture
 *
 * Uses Canvas 2D APIs to render text to an off-screen canvas, then creates
 * a Three.js plane mesh with that texture. This approach avoids the complexity
 * of converting fonts to Bezier paths while providing crisp text rendering.
 *
 * @example
 * ```typescript
 * // Create simple text
 * const text = new Text({ text: 'Hello World' });
 *
 * // Create styled text
 * const styled = new Text({
 *   text: 'Styled Text',
 *   fontSize: 72,
 *   fontFamily: 'Georgia',
 *   color: '#ff6600',
 *   fontWeight: 'bold'
 * });
 *
 * // Multi-line text
 * const multiline = new Text({ text: 'Line 1\nLine 2\nLine 3' });
 * ```
 */

export class Text extends TexturedMobject {
  protected _text: string;
  protected _fontSize: number;
  protected _fontFamily: string;
  protected _fontWeight: string | number;
  protected _fontStyle: string;
  /** Flag to track when canvas content needs re-rendering (text/color/font changes) */
  protected _canvasDirty: boolean = true;
  private _canvasMaterialKey = '';
  protected _lineHeight: number;
  protected _letterSpacing: number;
  protected _textAlign: 'left' | 'center' | 'right';

  /** Optional font URL for glyph vector extraction */
  protected _fontUrl?: string;

  /** Per-substring style maps (t2c/t2w/t2s). Empty when no styling requested. */
  protected _styleMaps: TextStyleMaps = {};
  /** Linear color gradient (2+ colors), or null when the fill is flat. */
  protected _gradient: string[] | null = null;
  /** Cached glyph group (created lazily by loadGlyphs) */
  protected _glyphGroup: TextGlyphGroup | null = null;
  private _glyphCacheKey: string | null = null;
  private _glyphPromise: Promise<TextGlyphGroup | null> | null = null;
  private _glyphRevision = 0;
  protected _visibleRange: [number, number] | null = null;

  /** Off-screen canvas for text rendering */
  protected _canvas: HTMLCanvasElement | null = null;
  protected _ctx: CanvasRenderingContext2D | null = null;

  /** Three.js texture from canvas */
  protected _texture: THREE.Texture | null = null;

  /** Plane mesh for displaying the texture */
  protected _mesh: THREE.Mesh | null = null;

  /** Cached dimensions in world units */
  protected _worldWidth: number = 0;
  protected _worldHeight: number = 0;

  constructor(options: TextOptions) {
    super();

    const {
      text,
      fontSize = 48,
      fontFamily = 'CMU Serif, Georgia, Times New Roman, serif',
      fontWeight = 'normal',
      fontStyle = 'normal',
      color = '#ffffff',
      fillOpacity = 1,
      strokeWidth = 0,
      lineHeight = 1.2,
      letterSpacing = 0,
      textAlign = 'center',
      fontUrl,
      t2c,
      t2w,
      t2s,
      gradient,
    } = options;

    this._text = text;
    this._styleMaps = { t2c, t2w, t2s };
    this._gradient = gradient ?? null;
    this._fontSize = fontSize;
    this._fontFamily = fontFamily;
    this._fontWeight = fontWeight;
    this._fontStyle = fontStyle;
    this._lineHeight = lineHeight;
    this._letterSpacing = letterSpacing;
    this._textAlign = textAlign;
    this._fontUrl = fontUrl;

    this.color = color;
    this.fillOpacity = fillOpacity;
    this.strokeWidth = strokeWidth;

    // Initialize canvas and render text so dimensions are available immediately
    this._initCanvas();
    this._renderToCanvas();
  }

  /**
   * Initialize the off-screen canvas
   */
  protected _initCanvas(): void {
    // Headless / non-DOM environment — skip canvas initialization, geometry will be empty
    if (typeof document === 'undefined') {
      return;
    }
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');
    if (!this._ctx) {
      throw new Error('Failed to get 2D context for text rendering');
    }
  }

  /**
   * Get the current text content
   */
  getText(): string {
    return this._text;
  }

  /** Logical displayed content, excluding markup syntax in subclasses. */
  getTextContent(): string {
    return this._text;
  }

  /** Currently visible graphemes; getText() retains the complete authored content. */
  getVisibleText(): string {
    const [start, end] = this.getVisibleRange();
    return textGraphemes(this.getTextContent())
      .slice(start, end)
      .map((part) => part.text)
      .join('');
  }

  /** Half-open grapheme range, independent of texture dimensions and line layout. */
  getVisibleRange(): [number, number] {
    return this._visibleRange
      ? [...this._visibleRange]
      : [0, textGraphemes(this.getTextContent()).length];
  }

  /** @post this.getText() === old.getText() */
  setVisibleRange(start: number, end: number): this {
    const length = textGraphemes(this.getTextContent()).length;
    const first = Math.max(0, Math.min(length, Math.floor(start)));
    const last = Math.max(first, Math.min(length, Math.floor(end)));
    const current = this.getVisibleRange();
    if (current[0] === first && current[1] === last) return this;
    this._visibleRange = [first, last];
    this._canvasDirty = true;
    this._renderToCanvas();
    this._markDirty();
    return this;
  }

  protected _visibleFragment(text: string, offset: number): { text: string; prefix: string } {
    const graphemes = textGraphemes(this.getTextContent());
    const [first, last] = this.getVisibleRange();
    const start = graphemes[first]?.start ?? this.getTextContent().length;
    const end = last > 0 ? (graphemes[last - 1]?.end ?? this.getTextContent().length) : 0;
    const from = Math.max(0, Math.min(text.length, start - offset));
    const to = Math.max(from, Math.min(text.length, end - offset));
    return { text: text.slice(from, to), prefix: text.slice(0, from) };
  }

  /**
   * Set new text content and re-render
   * @param text - New text to display
   * @returns this for chaining
   */
  setText(text: string): this {
    this._text = text;
    this._visibleRange = null;
    this._invalidateGlyphs();
    this._canvasDirty = true;
    this._renderToCanvas();
    this._updateMesh();
    this._markDirty();
    return this;
  }

  /**
   * Get the per-substring style layout model: lines of styled runs.
   *
   * This is the testable model behind `t2c`/`t2w`/`t2s`. A run's null fields
   * fall back to the Text base color/weight/style at render time.
   */
  getStyledTextLines(): TextStyleRun[][] {
    return buildStyledTextLines(this._text, this._styleMaps);
  }

  /**
   * Get the configured linear gradient colors, or null when the fill is flat.
   * Returns a copy so callers cannot mutate the internal state.
   */
  getGradient(): string[] | null {
    return this._gradient ? [...this._gradient] : null;
  }

  /**
   * True when this Text renders through the styled-run canvas path: either a
   * per-substring style map (t2c/t2w/t2s) or an active color gradient is set.
   * Plain Text with none of these keeps the original flat render path.
   */
  protected _usesStyledPath(): boolean {
    return hasStyleMaps(this._styleMaps) || gradientIsActive(this._gradient);
  }

  /**
   * Get the current font size
   */
  getFontSize(): number {
    return this._fontSize;
  }

  /**
   * Set font size and re-render
   * @param size - Font size in points
   * @returns this for chaining
   */
  setFontSize(size: number): this {
    this._fontSize = size;
    this._invalidateGlyphs();
    this._canvasDirty = true;
    this._renderToCanvas();
    this._updateMesh();
    this._markDirty();
    return this;
  }

  /**
   * Get the current font family
   */
  getFontFamily(): string {
    return this._fontFamily;
  }

  /**
   * Set font family and re-render
   * @param family - CSS font family string
   * @returns this for chaining
   */
  setFontFamily(family: string): this {
    this._fontFamily = family;
    this._invalidateGlyphs();
    this._canvasDirty = true;
    this._renderToCanvas();
    this._updateMesh();
    this._markDirty();
    return this;
  }

  override get color(): string {
    return super.color;
  }

  override set color(value: string) {
    if (super.color === value) return;
    super.color = value;
    this._canvasDirty = true;
    this._markDirty();
  }

  override captureState(): Record<string, unknown> {
    return {
      ...super.captureState(),
      text: this._text,
      fontSize: this._fontSize,
      fontFamily: this._fontFamily,
      fontUrl: this._fontUrl ?? null,
      fontWeight: this._fontWeight,
      fontStyle: this._fontStyle,
      lineHeight: this._lineHeight,
      letterSpacing: this._letterSpacing,
      textAlign: this._textAlign,
      visibleRange: this._visibleRange ? [...this._visibleRange] : null,
      visualSize: [this._worldWidth, this._worldHeight],
    };
  }

  override restoreCapturedState(state: Record<string, unknown>): void {
    super.restoreCapturedState(state);
    if (typeof state.text !== 'string') return;
    const glyphKey = this._getGlyphCacheKey();
    const canvasKey = this._getCanvasContentKey();
    const previousWidth = this._worldWidth;
    const previousHeight = this._worldHeight;
    this._text = state.text;
    if (typeof state.fontSize === 'number') this._fontSize = state.fontSize;
    if (typeof state.fontFamily === 'string') this._fontFamily = state.fontFamily;
    if ('fontUrl' in state)
      this._fontUrl = typeof state.fontUrl === 'string' ? state.fontUrl : undefined;
    if (typeof state.fontWeight === 'string' || typeof state.fontWeight === 'number')
      this._fontWeight = state.fontWeight;
    if (typeof state.fontStyle === 'string') this._fontStyle = state.fontStyle;
    if (typeof state.lineHeight === 'number') this._lineHeight = state.lineHeight;
    if (typeof state.letterSpacing === 'number') this._letterSpacing = state.letterSpacing;
    if (state.textAlign === 'left' || state.textAlign === 'center' || state.textAlign === 'right')
      this._textAlign = state.textAlign;
    this._visibleRange = Array.isArray(state.visibleRange)
      ? [Number(state.visibleRange[0]), Number(state.visibleRange[1])]
      : null;
    if (glyphKey !== this._getGlyphCacheKey()) this._invalidateGlyphs();
    if (canvasKey !== this._getCanvasContentKey() || this._canvasDirty) {
      this._renderToCanvas();
    }
    if (previousWidth !== this._worldWidth || previousHeight !== this._worldHeight)
      this._updateMesh();
    if (Array.isArray(state.visualSize)) {
      const width = Number(state.visualSize[0]);
      const height = Number(state.visualSize[1]);
      // A morph uses a unit plane with temporary mesh scaling. Redrawing the
      // restored text can already recover its dimensions while leaving that
      // scale behind, so size equality alone does not mean restoration is done.
      const meshScale = this._mesh?.scale;
      if (
        width !== this._worldWidth ||
        height !== this._worldHeight ||
        (meshScale && (meshScale.x !== 1 || meshScale.y !== 1 || meshScale.z !== 1))
      )
        this.applyVisualSize(width, height);
    }
    this._markDirty();
  }

  private _getCanvasContentKey(): string {
    return JSON.stringify([
      this._text,
      this._fontSize,
      this._fontFamily,
      this._fontWeight,
      this._fontStyle,
      this._lineHeight,
      this._letterSpacing,
      this._textAlign,
      this._visibleRange,
    ]);
  }

  /** Visible runs in reading order, with layout metrics from the same canvas as the image. */
  getSemanticTextRuns(): SemanticTextRun[] {
    this.getThreeObject();
    const source = this.getTextContent();
    const padding = this._fontSize * RESOLUTION_SCALE * 0.2;
    const lineHeight = this._fontSize * RESOLUTION_SCALE * this._lineHeight;
    if (this._ctx) this._ctx.font = this._buildFontString();
    const measure = (content: string) =>
      (this._ctx?.measureText(content).width ?? 0) +
      Math.max(0, textGraphemes(content).length - 1) * this._letterSpacing * RESOLUTION_SCALE;
    let offset = 0;
    const runs = this._measureText().lines.map((line, index) => {
      const lineOffset = Math.max(offset, source.indexOf(line, offset));
      const fragment = this._visibleFragment(line, lineOffset);
      const content = fragment.text;
      const start = lineOffset + fragment.prefix.length;
      const width = measure(line);
      const left =
        this._textAlign === 'left'
          ? padding
          : this._textAlign === 'right'
            ? (this._canvas?.width || 0) - padding - width
            : ((this._canvas?.width || 0) - width) / 2;
      const prefix = fragment.prefix;
      const prefixWidth = measure(prefix) + (prefix ? this._letterSpacing * RESOLUTION_SCALE : 0);
      offset = lineOffset + line.length;
      return {
        text: content,
        sourceOffset: start,
        font: {
          family: this._fontFamily,
          url: this._fontUrl,
          size: this._fontSize,
          weight: this._fontWeight,
          style: this._fontStyle,
          lineHeight: this._lineHeight,
          letterSpacing: this._letterSpacing,
        },
        color: this.color,
        x: left + prefixWidth,
        y: padding + index * lineHeight,
        width: measure(content),
        height: lineHeight,
      };
    });
    return canvasSemanticRuns(
      this,
      source,
      runs,
      this._canvas,
      this._worldWidth,
      this._worldHeight,
    );
  }

  /**
   * Get text width in world units
   */
  getWidth(): number {
    return this._worldWidth;
  }

  /**
   * Get text height in world units
   */
  getHeight(): number {
    return this._worldHeight;
  }

  /**
   * Build the CSS font string
   */
  protected _buildFontString(): string {
    const style = this._fontStyle === 'italic' ? 'italic' : 'normal';
    const weight =
      typeof this._fontWeight === 'number' ? this._fontWeight.toString() : this._fontWeight;
    const size = Math.round(this._fontSize * RESOLUTION_SCALE);
    return `${style} ${weight} ${size}pt ${this._fontFamily}`;
  }

  /**
   * Split text into lines and measure dimensions
   * @returns Object with lines array and canvas dimensions
   */
  protected _measureText(): { lines: string[]; width: number; height: number } {
    if (!this._ctx) {
      return { lines: [], width: 0, height: 0 };
    }

    if (this._usesStyledPath()) {
      return this._measureStyledText();
    }

    this._ctx.font = this._buildFontString();
    const lines = this._text.split('\n');
    const scaledFontSize = this._fontSize * RESOLUTION_SCALE;
    const scaledLineHeight = scaledFontSize * this._lineHeight;

    // Measure ink in the same baseline mode used by _renderToCanvas. Font sizes
    // are CSS points, so a glyph's descent can exceed the requested pixel line
    // advance; the final descender still needs room inside the texture.
    const previousBaseline = this._ctx.textBaseline;
    this._ctx.textBaseline = 'top';
    let maxWidth = 0;
    let inkBottom = 0;
    for (const [index, line] of lines.entries()) {
      const metrics = this._ctx.measureText(line);
      const lineWidth =
        metrics.width +
        Math.max(0, textGraphemes(line).length - 1) * this._letterSpacing * RESOLUTION_SCALE;
      maxWidth = Math.max(maxWidth, lineWidth);
      if (Number.isFinite(metrics.actualBoundingBoxDescent)) {
        inkBottom = Math.max(
          inkBottom,
          index * scaledLineHeight + metrics.actualBoundingBoxDescent,
        );
      }
    }
    this._ctx.textBaseline = previousBaseline;

    // Calculate total height
    const totalHeight = lines.length * scaledLineHeight;

    // Add padding
    const padding = scaledFontSize * 0.2;
    const width = Math.ceil(maxWidth + padding * 2);
    const strokeOutset = (Math.max(0, this.strokeWidth) * RESOLUTION_SCALE) / 2;
    const height = Math.ceil(Math.max(totalHeight, inkBottom + strokeOutset) + padding * 2);

    return { lines, width, height };
  }

  /**
   * Render text to the off-screen canvas
   */
  protected _renderToCanvas(): void {
    if (!this._canvas || !this._ctx) {
      return;
    }

    if (this._usesStyledPath()) {
      this._renderStyledToCanvas();
      return;
    }

    const { lines, width, height } = this._measureText();

    // Resize canvas
    this._canvas.width = width || 1;
    this._canvas.height = height || 1;

    // Clear canvas (transparent background)
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // Set font and styles
    this._ctx.font = this._buildFontString();
    this._ctx.textBaseline = 'top';
    this._ctx.textAlign = this._textAlign;

    const scaledFontSize = this._fontSize * RESOLUTION_SCALE;
    const scaledLineHeight = scaledFontSize * this._lineHeight;
    const padding = scaledFontSize * 0.2;

    // Calculate x position based on alignment
    let textX: number;
    switch (this._textAlign) {
      case 'left':
        textX = padding;
        break;
      case 'right':
        textX = width - padding;
        break;
      case 'center':
      default:
        textX = width / 2;
        break;
    }

    const graphemes = textGraphemes(this._text);
    const [visibleStart, visibleEnd] = this.getVisibleRange();
    const sourceStart = graphemes[visibleStart]?.start ?? this._text.length;
    const sourceEnd = visibleEnd > 0 ? (graphemes[visibleEnd - 1]?.end ?? this._text.length) : 0;
    let lineOffset = 0;

    // Draw visible text at its position in the complete line, without reflow.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      lineOffset = Math.max(lineOffset, this._text.indexOf(line, lineOffset));
      const y = padding + i * scaledLineHeight;
      const from = Math.max(0, Math.min(line.length, sourceStart - lineOffset));
      const to = Math.max(from, Math.min(line.length, sourceEnd - lineOffset));
      const visibleLine = line.slice(from, to);
      const partial = from > 0 || to < line.length;
      const spacing = this._letterSpacing * RESOLUTION_SCALE;
      const fullWidth =
        this._ctx.measureText(line).width + Math.max(0, textGraphemes(line).length - 1) * spacing;
      const prefix = line.slice(0, from);
      const prefixWidth =
        this._ctx.measureText(prefix).width + textGraphemes(prefix).length * spacing;
      const left =
        this._textAlign === 'left'
          ? textX
          : textX - fullWidth / (this._textAlign === 'center' ? 2 : 1);
      const drawX = partial ? left + prefixWidth : textX;
      this._ctx.textAlign = partial ? 'left' : this._textAlign;
      lineOffset += line.length;

      // Apply letter spacing if needed
      if (this._letterSpacing > 0) {
        this._drawTextWithLetterSpacing(visibleLine, drawX, y, scaledFontSize, partial);
      } else {
        // Draw stroke if strokeWidth > 0
        if (this.strokeWidth > 0) {
          this._ctx.strokeStyle = this.color;
          this._ctx.lineWidth = this.strokeWidth * RESOLUTION_SCALE;
          this._ctx.strokeText(visibleLine, drawX, y);
        }

        // Draw fill (use fillOpacity only; dynamic _opacity is handled by material)
        this._ctx.fillStyle = this.color;
        this._ctx.globalAlpha = this.fillOpacity;
        this._ctx.fillText(visibleLine, drawX, y);
      }
    }

    // Store world dimensions
    // Conversion chain: canvas pixels → pt → EM → world space
    // At 72 DPI, 1pt = SVG_UNITS_PER_PT canvas pixels
    // 1 EM = DEFAULT_FONT_SIZE_PT at the reference size
    // 1 EM = DEFAULT_FONT_SIZE_IN_WORLD_SPACE world units at reference
    const pxToWorld =
      (1 / SVG_UNITS_PER_PT) * // px → pt
      (1 / DEFAULT_FONT_SIZE_PT) * // pt → EM
      DEFAULT_FONT_SIZE_IN_WORLD_SPACE; // EM → world
    this._worldWidth = (width / RESOLUTION_SCALE) * pxToWorld;
    this._worldHeight = (height / RESOLUTION_SCALE) * pxToWorld;

    // Clear canvas dirty flag
    this._canvasDirty = false;

    // Update texture if it exists
    if (this._texture) {
      this._texture.image = this._canvas;
      this._texture.needsUpdate = true;
    }
  }

  /**
   * Draw text with custom letter spacing
   */
  protected _drawTextWithLetterSpacing(
    text: string,
    startX: number,
    y: number,
    _fontSize: number,
    leftAligned = false,
  ): void {
    if (!this._ctx) return;

    const scaledSpacing = this._letterSpacing * RESOLUTION_SCALE;
    let currentX = startX;

    // Adjust starting position based on alignment
    const graphemes = textGraphemes(text);
    if (!leftAligned && this._textAlign === 'center') {
      const totalWidth =
        this._ctx.measureText(text).width + Math.max(0, graphemes.length - 1) * scaledSpacing;
      currentX = startX - totalWidth / 2;
    } else if (!leftAligned && this._textAlign === 'right') {
      const totalWidth =
        this._ctx.measureText(text).width + Math.max(0, graphemes.length - 1) * scaledSpacing;
      currentX = startX - totalWidth;
    }

    this._ctx.textAlign = 'left';

    for (const { text: char } of graphemes) {
      // Draw stroke if strokeWidth > 0
      if (this.strokeWidth > 0) {
        this._ctx.strokeStyle = this.color;
        this._ctx.lineWidth = this.strokeWidth * RESOLUTION_SCALE;
        this._ctx.strokeText(char, currentX, y);
      }

      // Draw fill (use fillOpacity only; dynamic _opacity is handled by material)
      this._ctx.fillStyle = this.color;
      this._ctx.globalAlpha = this.fillOpacity;
      this._ctx.fillText(char, currentX, y);

      currentX += this._ctx.measureText(char).width + scaledSpacing;
    }

    // Restore alignment
    this._ctx.textAlign = this._textAlign;
  }

  /** Collect the style and layout fields the styled canvas path needs. */
  protected _styledTextParams(): StyledTextParams {
    return {
      fontSize: this._fontSize,
      fontFamily: this._fontFamily,
      fontStyle: this._fontStyle,
      fontWeight: this._fontWeight,
      lineHeight: this._lineHeight,
      textAlign: this._textAlign,
      color: this.color,
      fillOpacity: this.fillOpacity,
      strokeWidth: this.strokeWidth,
      gradient: this._gradient ?? undefined,
    };
  }

  /**
   * Measure styled (t2c/t2w/t2s) text via the shared styled-run layout helper.
   */
  protected _measureStyledText(): { lines: string[]; width: number; height: number } {
    if (!this._ctx) {
      return { lines: [], width: 0, height: 0 };
    }
    return measureStyledText(this._ctx, this.getStyledTextLines(), this._styledTextParams());
  }

  /**
   * Render styled (t2c/t2w/t2s) text through the shared styled-run renderer,
   * then store the resulting world-space size.
   */
  protected _renderStyledToCanvas(): void {
    if (!this._canvas || !this._ctx) {
      return;
    }
    const size = renderStyledTextToCanvas(
      this._canvas,
      this._ctx,
      this.getStyledTextLines(),
      this._styledTextParams(),
      {
        defaultFontSizePt: DEFAULT_FONT_SIZE_PT,
        defaultFontSizeInWorld: DEFAULT_FONT_SIZE_IN_WORLD_SPACE,
      },
    );
    this._worldWidth = size.width;
    this._worldHeight = size.height;
    this._canvasDirty = false;
    if (this._texture) {
      this._texture.needsUpdate = true;
    }
  }

  /**
   * Update the mesh geometry to match new dimensions
   */
  protected _updateMesh(): void {
    if (!this._mesh) return;

    // Dispose old geometry
    this._mesh.geometry.dispose();

    // Create new geometry with updated dimensions
    this._mesh.geometry = new THREE.PlaneGeometry(this._worldWidth, this._worldHeight);
  }

  /**
   * Create the Three.js backing object
   */
  protected override _createThreeObject(): THREE.Object3D {
    const group = new THREE.Group();

    // Render text to canvas
    this._renderToCanvas();

    if (!this._canvas) {
      return group;
    }

    // Create texture from canvas
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.colorSpace = THREE.SRGBColorSpace;
    this._texture.minFilter = THREE.LinearFilter;
    this._texture.magFilter = THREE.LinearFilter;

    // Create material with transparency
    const material = new THREE.MeshBasicMaterial({
      map: this._texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create plane geometry sized to match text
    const geometry = new THREE.PlaneGeometry(this._worldWidth, this._worldHeight);

    // Create mesh
    this._mesh = new THREE.Mesh(geometry, material);
    this._mesh.frustumCulled = false;
    group.add(this._mesh);

    return group;
  }

  override getDisplayMeshLength(): number {
    return 1;
  }

  override getDisplayMeshes(): THREE.Mesh[] {
    const object = this.getThreeObject();
    if (!(object instanceof THREE.Group)) {
      throw new Error('Text.getThreeObject() must return a THREE.Group');
    }
    if (!this._mesh) {
      throw new Error('Text.getDisplayMeshes() requires _mesh');
    }

    return [this._mesh];
  }

  applyTextureFrom(other: TexturedMobject): void {
    if (!(other instanceof Text)) {
      throw new Error('Text.applyTextureFrom requires Text');
    }
    if (!this._mesh) {
      throw new Error('Text.applyTextureFrom requires _mesh');
    }
    if (!other._mesh) {
      throw new Error('Text.applyTextureFrom requires source _mesh');
    }

    const material = this._mesh.material;
    const sourceMaterial = other._mesh.material;
    if (!(material instanceof THREE.MeshBasicMaterial)) {
      throw new Error('Text.applyTextureFrom requires MeshBasicMaterial');
    }
    if (!(sourceMaterial instanceof THREE.MeshBasicMaterial)) {
      throw new Error('Text.applyTextureFrom requires source MeshBasicMaterial');
    }

    // The image is handed off briefly until applyContentFrom redraws our canvas.
    // Both the texture and its Source must be independent: Texture.clone() alone
    // shares Source, so changing image would otherwise mutate the target too.
    const nextTexture = sourceMaterial.map?.clone() ?? null;
    if (nextTexture && sourceMaterial.map)
      nextTexture.source = new THREE.Source(sourceMaterial.map.image);
    const previousTexture = this._texture;
    this._handoffTextureMap(material, nextTexture, previousTexture);
    this._texture = nextTexture;
    this._canvasDirty = true;
  }

  applyContentFrom(other: TexturedMobject): void {
    if (!(other instanceof Text)) {
      throw new Error('Text.applyContentFrom requires Text');
    }
    this.color = other.color;
    this.fillOpacity = other.fillOpacity;
    this.strokeWidth = other.strokeWidth;
    this.restoreCapturedState({
      ...other.captureState(),
      visualSize: [this._worldWidth, this._worldHeight],
    });
  }

  applyVisualSize(width: number, height: number): void {
    this._worldWidth = width;
    this._worldHeight = height;
    this._updateMesh();
    if (this._mesh) {
      this._mesh.scale.set(1, 1, 1);
    }
    // The `_worldWidth`/`_worldHeight` are now authoritative. Clear any pending
    // canvas-dirty flag so a later `_syncMaterialToThree` does not re-render and
    // RECOMPUTE the size from the canvas, silently dropping the explicit size
    // (e.g. a `getBounds()` on a subclass whose normalize left `_canvasDirty`
    // set, such as Paragraph).
    this._canvasDirty = false;
  }

  /**
   * Sync material properties to Three.js
   */
  protected override _syncMaterialToThree(): void {
    // Only re-render canvas when text/color/font changed (not for opacity-only changes)
    const materialKey = JSON.stringify([this.color, this.fillOpacity, this.strokeWidth]);
    if (this._canvasDirty || this._canvasMaterialKey !== materialKey) {
      this._renderToCanvas();
      this._canvasMaterialKey = materialKey;
    }

    if (this._mesh) {
      const material = this._mesh.material as THREE.MeshBasicMaterial;
      if (material) {
        material.opacity = this._opacity;
      }
    }
  }

  /**
   * Get the cached TextGlyphGroup (null until loadGlyphs() resolves).
   */
  getGlyphGroup(): TextGlyphGroup | null {
    if (this._glyphGroup && this._glyphCacheKey !== this._getGlyphCacheKey())
      this._invalidateGlyphs();
    return this._glyphGroup;
  }

  private _getGlyphCacheKey(): string {
    return JSON.stringify([
      this._text,
      this._fontUrl,
      this._fontSize,
      this._fontFamily,
      this._fontWeight,
      this._fontStyle,
      this.color,
      this.fillOpacity,
      this.strokeWidth,
    ]);
  }

  protected _invalidateGlyphs(): void {
    this._glyphRevision++;
    this._glyphGroup?.dispose();
    this._glyphGroup = null;
    this._glyphCacheKey = null;
    this._glyphPromise = null;
  }

  /** Wait for CSS font metrics before layout inspection or capture. */
  async waitForRender(): Promise<void> {
    if (this._fontUrl) {
      const familyName = await loadFontFace(this._fontUrl, undefined, {
        weight: this._fontWeight,
        style: this._fontStyle,
      });
      if (familyName) this._fontFamily = `'${familyName}'`;
    }
    if (typeof document !== 'undefined' && typeof document.fonts?.load === 'function') {
      await document.fonts.load(this._buildFontString(), this._text);
    }
    this._canvasDirty = true;
    this._renderToCanvas();
    this._updateMesh();
    this._markDirty();
  }

  /**
   * Lazily create a TextGlyphGroup from the font file at _fontUrl.
   * Returns null if no fontUrl was provided.
   *
   * @param options.useSkeletonStroke  When true, each glyph computes its
   *   skeleton (medial axis) for center-line stroke animation. Default: false.
   * @param options.skeletonOptions  Fine-tuning options for the skeletonization
   *   algorithm (grid resolution, smoothing, etc.).
   */
  async loadGlyphs(options?: {
    useSkeletonStroke?: boolean;
    skeletonOptions?: SkeletonizeOptions;
  }): Promise<TextGlyphGroup | null> {
    if (this.getGlyphGroup()) return this._glyphGroup;
    if (!this._fontUrl) return null;
    if (this._glyphPromise) return this._glyphPromise;
    const pending = this._loadGlyphs(options);
    this._glyphPromise = pending;
    try {
      return await pending;
    } finally {
      if (this._glyphPromise === pending) this._glyphPromise = null;
    }
  }

  private async _loadGlyphs(options?: {
    useSkeletonStroke?: boolean;
    skeletonOptions?: SkeletonizeOptions;
  }): Promise<TextGlyphGroup | null> {
    const initialKey = this._getGlyphCacheKey();
    const revision = this._glyphRevision;

    // Load the font URL as a CSS @font-face (cached across all Text instances)
    // so the Canvas 2D renderer uses the same font file as the opentype.js glyph strokes.
    const familyName = await loadFontFace(this._fontUrl!, undefined, {
      weight: this._fontWeight,
      style: this._fontStyle,
    });
    if (initialKey !== this._getGlyphCacheKey() || revision !== this._glyphRevision) return null;
    // `loadFontFace` returns '' when the CSS Font Loading API is unavailable
    // (non-DOM, or DOM emulator without `document.fonts`); keep the existing
    // _fontFamily in that case so the canvas renderer doesn't try to use the
    // empty family `''`.
    if (familyName) {
      this._fontFamily = `'${familyName}'`;
      this._canvasDirty = true;
      this._renderToCanvas();
      this._updateMesh();
    }

    const key = this._getGlyphCacheKey();
    const group = new TextGlyphGroup({
      text: this._text,
      fontUrl: this._fontUrl!,
      fontSize: this._fontSize,
      color: this.color,
      strokeWidth: 2,
      useSkeletonStroke: options?.useSkeletonStroke,
      skeletonOptions: options?.skeletonOptions,
    });
    await group.waitForReady();
    if (key !== this._getGlyphCacheKey() || revision !== this._glyphRevision) {
      group.dispose();
      return null;
    }
    this._glyphGroup = group;
    this._glyphCacheKey = key;
    return group;
  }

  /**
   * Get the texture mesh (for animation cross-fade access).
   */
  getTextureMesh(): THREE.Mesh | null {
    return this._mesh;
  }

  /**
   * Get the center of this text mobject
   */
  override getCenter(): Vector3Tuple {
    return [this.position.x, this.position.y, this.position.z];
  }

  /**
   * Create a copy of this Text mobject
   */
  override copy(): Text {
    const copy = new Text({
      text: this._text,
      fontSize: this._fontSize,
      fontFamily: this._fontFamily,
      fontWeight: this._fontWeight,
      fontStyle: this._fontStyle,
      color: this.color,
      fillOpacity: this.fillOpacity,
      strokeWidth: this.strokeWidth,
      lineHeight: this._lineHeight,
      letterSpacing: this._letterSpacing,
      textAlign: this._textAlign,
      fontUrl: this._fontUrl,
      t2c: this._styleMaps.t2c,
      t2w: this._styleMaps.t2w,
      t2s: this._styleMaps.t2s,
      gradient: this._gradient ?? undefined,
    });
    this._copyBaseAttributesInto(copy, { copyChildren: false });
    if (this._visibleRange) copy.setVisibleRange(...this._visibleRange);
    this._carryVisualSizeTo(copy);
    return copy;
  }

  /**
   * Copy this Text's persistent visual-size state onto a freshly-constructed copy.
   *
   * A subclass `_createCopy` rebuilds the copy from `text`+`fontSize`, so its
   * constructor re-measures from scratch. If the source had its size adjusted via
   * `applyVisualSize` (e.g. during a shape morph), the copy would otherwise lose
   * it. This builds the copy's mesh first (so `_createThreeObject`'s canvas render
   * recomputes the size before we overwrite it), then applies the source's
   * persistent size to the geometry. (The transform `scaleVector` is copied
   * separately by `_copyBaseAttributesInto`.)
   *
   * Robust whether or not the source was resized: for an unmodified Text this just
   * re-copies the already-equal size, a no-op. Shared by `MarkupText`/`Paragraph`,
   * which override `_createCopy` without calling super.
   */
  protected _carryVisualSizeTo(copy: Text): void {
    copy.getThreeObject();
    copy._worldWidth = this._worldWidth;
    copy._worldHeight = this._worldHeight;
    copy._updateMesh();
    // The copy's canvas was just rendered by `getThreeObject()`; clear the dirty
    // flag so a later `_syncMaterialToThree` does not re-render and RECOMPUTE
    // `_worldWidth`/`_worldHeight` from the unscaled canvas, clobbering the size
    // we just carried over.
    copy._canvasDirty = false;
  }

  /**
   * Clean up Three.js and canvas resources
   */
  override dispose(): void {
    this._invalidateGlyphs();
    this._texture?.dispose();
    if (this._mesh) {
      this._mesh.geometry.dispose();
      (this._mesh.material as THREE.Material).dispose();
    }
    this._canvas = null;
    this._ctx = null;
    super.dispose();
  }
}
