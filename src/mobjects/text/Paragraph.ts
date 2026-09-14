import { Text, TextOptions } from './Text';
import { getTextResolutionScale } from './textTexture';
import {
  canvasSemanticRuns,
  textGraphemes,
  type CanvasTextRun,
  type SemanticTextRun,
} from './TextSemantics';

/**
 * Options for creating a Paragraph mobject
 */
export interface ParagraphOptions extends TextOptions {
  /** Maximum width in world units for text wrapping */
  width?: number;
  /** Text alignment within the paragraph. Default: 'left' */
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

/** Scale factor: pixels to world units (100 pixels = 1 world unit) */
const PIXEL_TO_WORLD = 1 / 100;

/**
 * Paragraph - A text mobject with automatic word wrapping
 *
 * Extends Text to add word wrapping functionality. Text is wrapped
 * to fit within a specified width, with configurable alignment.
 *
 * @example
 * ```typescript
 * // Create a paragraph with max width
 * const para = new Paragraph({
 *   text: 'This is a long paragraph that will automatically wrap to fit within the specified width.',
 *   width: 4,  // 4 world units
 *   alignment: 'justify'
 * });
 *
 * // Update width to trigger re-wrap
 * para.setWidth(3);
 * ```
 */
export class Paragraph extends Text {
  private _semanticLayout: CanvasTextRun[] = [];
  protected _maxWidth: number;
  protected _alignment: 'left' | 'center' | 'right' | 'justify';
  protected _wrappedLines: string[] = [];

  constructor(options: ParagraphOptions) {
    // Set text alignment to match paragraph alignment
    const alignment = options.alignment || 'left';
    const textAlign = alignment === 'justify' ? 'left' : alignment;

    super({
      ...options,
      textAlign,
    });

    this._maxWidth = options.width || Infinity;
    this._alignment = alignment;

    // Re-render with wrapping applied
    this._renderToCanvas();
  }

  /**
   * Get the maximum width for text wrapping
   */
  getMaxWidth(): number {
    return this._maxWidth;
  }

  /**
   * Set maximum width and trigger re-wrap
   * @param width - Maximum width in world units
   * @returns this for chaining
   */
  setWidth(width: number): this {
    this._maxWidth = width;
    this._renderToCanvas();
    this._updateMesh();
    this._markDirty();
    return this;
  }

  /**
   * Get the paragraph alignment
   */
  getAlignment(): 'left' | 'center' | 'right' | 'justify' {
    return this._alignment;
  }

  /**
   * Set paragraph alignment
   * @param alignment - Text alignment
   * @returns this for chaining
   */
  setAlignment(alignment: 'left' | 'center' | 'right' | 'justify'): this {
    this._alignment = alignment;
    this._textAlign = alignment === 'justify' ? 'left' : alignment;
    this._renderToCanvas();
    this._updateMesh();
    this._markDirty();
    return this;
  }

  /**
   * Wrap text to fit within max width
   * @returns Array of wrapped lines
   */
  protected _wrapText(): string[] {
    if (!this._ctx) {
      return this._text.split('\n');
    }

    const RESOLUTION_SCALE = getTextResolutionScale();
    this._ctx.font = this._buildFontString();

    // Convert world units to pixels for comparison
    const maxWidthPixels =
      this._maxWidth === Infinity ? Infinity : (this._maxWidth / PIXEL_TO_WORLD) * RESOLUTION_SCALE;

    const paragraphs = this._text.split('\n');
    const wrappedLines: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') {
        wrappedLines.push('');
        continue;
      }

      const words = paragraph.match(/\s*\S+\s*/gu) ?? [paragraph];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine + word;
        const metrics = this._ctx.measureText(testLine);
        const testWidth =
          metrics.width +
          Math.max(0, textGraphemes(testLine).length - 1) * this._letterSpacing * RESOLUTION_SCALE;

        if (testWidth <= maxWidthPixels || currentLine === '') {
          currentLine = testLine;
        } else {
          wrappedLines.push(currentLine);
          currentLine = word;
        }
      }

      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }

    return wrappedLines;
  }

  /**
   * Override measure text to use wrapped lines
   */
  protected override _measureText(): { lines: string[]; width: number; height: number } {
    if (!this._ctx) {
      return { lines: [], width: 0, height: 0 };
    }

    const RESOLUTION_SCALE = getTextResolutionScale();
    this._ctx.font = this._buildFontString();
    const lines = this._wrapText();
    this._wrappedLines = lines;

    const scaledFontSize = this._fontSize * RESOLUTION_SCALE;
    const scaledLineHeight = scaledFontSize * this._lineHeight;

    // Measure each line width
    let maxWidth = 0;
    for (const line of lines) {
      const metrics = this._ctx.measureText(line);
      const lineWidth =
        metrics.width +
        Math.max(0, textGraphemes(line).length - 1) * this._letterSpacing * RESOLUTION_SCALE;
      maxWidth = Math.max(maxWidth, lineWidth);
    }

    // If we have a max width constraint, use it
    if (this._maxWidth !== Infinity) {
      const maxWidthPixels = (this._maxWidth / PIXEL_TO_WORLD) * RESOLUTION_SCALE;
      maxWidth = Math.min(maxWidth, maxWidthPixels);
    }

    // Calculate total height
    const totalHeight = lines.length * scaledLineHeight;

    // Add padding
    const padding = scaledFontSize * 0.2;
    const width = Math.ceil(maxWidth + padding * 2);
    const height = Math.ceil(totalHeight + padding * 2);

    return { lines, width, height };
  }

  /**
   * Render text to canvas with justification support
   */
  protected override _renderToCanvas(): void {
    if (!this._canvas || !this._ctx) {
      return;
    }

    const RESOLUTION_SCALE = getTextResolutionScale();
    const { lines, width, height } = this._measureText();

    // Resize canvas
    this._canvas.width = width || 1;
    this._canvas.height = height || 1;

    // Clear canvas (transparent background)
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // Set font and styles
    this._ctx.font = this._buildFontString();
    this._ctx.textBaseline = 'top';

    const scaledFontSize = this._fontSize * RESOLUTION_SCALE;
    const scaledLineHeight = scaledFontSize * this._lineHeight;
    const padding = scaledFontSize * 0.2;

    let sourceOffset = 0;
    this._semanticLayout = [];
    // Draw each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const offset = Math.max(sourceOffset, this._text.indexOf(line, sourceOffset));
      sourceOffset = offset + line.length;
      const y = padding + i * scaledLineHeight;
      const isLastLineOfParagraph =
        i === lines.length - 1 || (i < lines.length - 1 && this._isNewParagraph(lines, i));

      if (this._alignment === 'justify' && !isLastLineOfParagraph && line.trim().includes(' ')) {
        this._drawJustifiedLine(line, padding, width - padding, y, offset);
      } else {
        // Use regular alignment
        let textX: number;
        switch (this._alignment) {
          case 'right':
            this._ctx.textAlign = 'right';
            textX = width - padding;
            break;
          case 'center':
            this._ctx.textAlign = 'center';
            textX = width / 2;
            break;
          case 'left':
          case 'justify':
          default:
            this._ctx.textAlign = 'left';
            textX = padding;
            break;
        }

        const measured = this._ctx.measureText(line).width;
        const left =
          this._alignment === 'center'
            ? textX - measured / 2
            : this._alignment === 'right'
              ? textX - measured
              : textX;
        this._drawFragment(line, offset, left, y, scaledLineHeight);
      }
    }

    // Store world dimensions
    this._worldWidth = (width / RESOLUTION_SCALE) * PIXEL_TO_WORLD;
    this._worldHeight = (height / RESOLUTION_SCALE) * PIXEL_TO_WORLD;
    this._canvasDirty = false;

    // Update texture if it exists
    if (this._texture) {
      this._texture.image = this._canvas;
      this._texture.needsUpdate = true;
    }
  }

  /**
   * Check if the next line starts a new paragraph (empty line or explicit break)
   */
  protected _isNewParagraph(lines: string[], currentIndex: number): boolean {
    if (currentIndex >= lines.length - 1) return true;
    return lines[currentIndex + 1].trim() === '';
  }

  /**
   * Draw a line with justified spacing
   */
  protected _drawJustifiedLine(
    line: string,
    startX: number,
    endX: number,
    y: number,
    sourceOffset = 0,
  ): void {
    if (!this._ctx) return;

    const RESOLUTION_SCALE = getTextResolutionScale();
    const words = line.trim().split(/\s+/);
    if (words.length <= 1) {
      this._drawFragment(
        line,
        sourceOffset,
        startX,
        y,
        this._fontSize * RESOLUTION_SCALE * this._lineHeight,
      );
      return;
    }

    // Calculate total word width
    let totalWordWidth = 0;
    for (const word of words) {
      totalWordWidth += this._ctx.measureText(word).width;
    }

    // Calculate space between words
    const availableWidth = endX - startX;
    const totalSpacing = availableWidth - totalWordWidth;
    const spaceWidth = totalSpacing / (words.length - 1);

    // Draw each word
    this._ctx.textAlign = 'left';
    let currentX = startX;

    let offset = 0;
    for (const word of words) {
      offset = line.indexOf(word, offset);
      this._drawFragment(
        word,
        sourceOffset + offset,
        currentX,
        y,
        this._fontSize * RESOLUTION_SCALE * this._lineHeight,
      );
      offset += word.length;
      currentX += this._ctx.measureText(word).width + spaceWidth;
    }
  }

  private _drawFragment(text: string, offset: number, x: number, y: number, height: number): void {
    if (!this._ctx) return;
    const fragment = this._visibleFragment(text, offset);
    const drawX = x + this._ctx.measureText(fragment.prefix).width;
    this._ctx.textAlign = 'left';
    if (this.strokeWidth > 0) {
      this._ctx.strokeStyle = this.color;
      this._ctx.lineWidth = this.strokeWidth * getTextResolutionScale();
      this._ctx.strokeText(fragment.text, drawX, y);
    }
    this._ctx.fillStyle = this.color;
    this._ctx.globalAlpha = this.fillOpacity;
    this._ctx.fillText(fragment.text, drawX, y);
    this._semanticLayout?.push({
      text: fragment.text,
      sourceOffset: offset + fragment.prefix.length,
      x: drawX,
      y,
      width: this._ctx.measureText(fragment.text).width,
      height,
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
    });
  }

  override getSemanticTextRuns(): SemanticTextRun[] {
    this.getThreeObject();
    return canvasSemanticRuns(
      this,
      this.getTextContent(),
      this._semanticLayout,
      this._canvas,
      this._worldWidth,
      this._worldHeight,
    );
  }

  override captureState(): Record<string, unknown> {
    return {
      ...super.captureState(),
      paragraphWidth: this._maxWidth,
      paragraphAlignment: this._alignment,
    };
  }

  override restoreCapturedState(state: Record<string, unknown>): void {
    if (state.paragraphWidth !== this._maxWidth || state.paragraphAlignment !== this._alignment)
      this._canvasDirty = true;
    if (typeof state.paragraphWidth === 'number') this._maxWidth = state.paragraphWidth;
    if (
      state.paragraphAlignment === 'left' ||
      state.paragraphAlignment === 'center' ||
      state.paragraphAlignment === 'right' ||
      state.paragraphAlignment === 'justify'
    )
      this._alignment = state.paragraphAlignment;
    super.restoreCapturedState(state);
  }

  /**
   * Create a copy of this Paragraph mobject
   */
  override copy(): Paragraph {
    const copy = new Paragraph({
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
      width: this._maxWidth,
      alignment: this._alignment,
    });
    this._copyBaseAttributesInto(copy, { copyChildren: false });
    if (this._visibleRange) copy.setVisibleRange(...this._visibleRange);
    this._carryVisualSizeTo(copy);
    return copy;
  }
}
