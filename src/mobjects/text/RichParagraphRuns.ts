import { Text, type TextOptions } from './Text';
import { MathTex, type MathTexOptions } from './MathTex';
import { VMobject } from '../../core/VMobject';
import { VGroup } from '../../core/VGroup';
import type { Mobject } from '../../core/Mobject';
import { DEFAULT_FONT_SIZE_IN_WORLD_SPACE, DEFAULT_FONT_SIZE_PT } from '../../constants/fontRender';

export interface InlineMetrics {
  /** Content advance, without the texture's transparent padding. */
  width: number;
  left: number;
  baseline: number;
  ascent: number;
  descent: number;
}

/** Text whose prepared geometry survives later recursive readiness checks. */
export class ParagraphTextRun extends Text {
  private _ready: Promise<void> | null = null;

  override waitForRender(): Promise<void> {
    return (this._ready ??= super.waitForRender());
  }

  measureInline(): InlineMetrics {
    if (!this._ctx || !this._canvas) {
      throw new Error('RichParagraph needs a browser canvas to measure text.');
    }
    this._ctx.font = this._buildFontString();
    const pixelsToWorld = this._worldHeight / this._canvas.height;
    const padding = this._fontSize * 2 * 0.2;
    this._ctx.textBaseline = 'alphabetic';
    const alphabetic = this._ctx.measureText('Mg');
    this._ctx.textBaseline = 'top';
    const top = this._ctx.measureText('Mg');
    const measuredBaseline = alphabetic.actualBoundingBoxAscent - top.actualBoundingBoxAscent;
    const baselinePixels = Number.isFinite(measuredBaseline)
      ? measuredBaseline
      : this._fontSize * 2 * (4 / 3) * 0.8;
    const baseline = this._worldHeight / 2 - (padding + baselinePixels) * pixelsToWorld;
    return {
      width: this._ctx.measureText(this._text).width * pixelsToWorld,
      left: -this._worldWidth / 2 + padding * pixelsToWorld,
      baseline,
      ascent: this._worldHeight / 2 - baseline,
      descent: this._worldHeight / 2 + baseline,
    };
  }

  override copy(): ParagraphTextRun {
    const options: TextOptions = {
      text: this._text,
      fontSize: this._fontSize,
      fontFamily: this._fontFamily,
      fontUrl: this._fontUrl,
      color: this.color,
      lineHeight: this._lineHeight,
      textAlign: this._textAlign,
      fontWeight: this._fontWeight,
      fontStyle: this._fontStyle,
      fillOpacity: this.fillOpacity,
      strokeWidth: this.strokeWidth,
      letterSpacing: this._letterSpacing,
    };
    const copy = new ParagraphTextRun(options);
    this._copyBaseAttributesInto(copy, { copyChildren: false });
    if (this._visibleRange) copy.setVisibleRange(...this._visibleRange);
    this._carryVisualSizeTo(copy);
    copy._ready = this._ready ? Promise.resolve() : null;
    return copy;
  }
}

/** Captures MathJax's baseline before MathTex centers the vector geometry. */
export class ParagraphMathRun extends MathTex {
  metrics: InlineMetrics | null = null;

  protected override _scaleToTarget(): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const visit = (object: Mobject): void => {
      if (object instanceof VMobject && !(object instanceof VGroup)) {
        for (const [x, y] of object.getLocalPoints()) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      object.children.forEach(visit);
    };
    visit(this);
    if (Number.isFinite(minX)) {
      const scale =
        (this._fontSize * DEFAULT_FONT_SIZE_IN_WORLD_SPACE) / (DEFAULT_FONT_SIZE_PT * 1000);
      this.metrics = {
        width: (maxX - minX) * scale,
        left: (-(maxX - minX) * scale) / 2,
        baseline: (-(minY + maxY) * scale) / 2,
        ascent: maxY * scale,
        descent: -minY * scale,
      };
    }
    super._scaleToTarget();
  }

  measureInline(): InlineMetrics {
    if (!this.metrics) throw new Error('Inline math must contain visible formula content.');
    return this.metrics;
  }

  override copy(): ParagraphMathRun {
    const options: MathTexOptions = {
      latex: this._sourceLatex,
      fontSize: this._fontSize,
      color: this.color,
      displayMode: false,
      strokeWidth: this.strokeWidth,
      fillOpacity: this.fillOpacity,
    };
    const copy = new ParagraphMathRun(options, false);
    this._copyBaseAttributesInto(copy);
    copy.metrics = this.metrics ? { ...this.metrics } : null;
    copy._parts = this._isMultiPart
      ? copy.children.filter((child): child is VGroup => child instanceof VGroup)
      : [];
    return copy;
  }
}

export type InlineSource = { kind: 'text' | 'math' | 'break'; text: string };

function closingDollar(source: string, start: number): number {
  for (let index = start; index < source.length && source[index] !== '\n'; index++) {
    if (source[index] === '\\') index++;
    else if (source[index] === '$') return index;
  }
  return -1;
}

/** A deliberately small inline grammar: prose, $math$, escaped dollars and newlines. */
export function parseInlineSource(source: string): InlineSource[] {
  const result: InlineSource[] = [];
  let prose = '';
  const flush = (): void => {
    for (const text of prose.match(/\r\n|\r|\n|[^\S\r\n]+|[^\s]+/g) ?? []) {
      result.push({ kind: /^[\r\n]/.test(text) ? 'break' : 'text', text });
    }
    prose = '';
  };
  for (let index = 0; index < source.length; index++) {
    if (source.slice(index, index + 2) === '$$') {
      throw new Error(
        'RichParagraph supports $inline math$; use a separate MathTex for display math.',
      );
    }
    if (source[index] === '\\' && source[index + 1] === '\\') {
      prose += '\\\\';
      index++;
    } else if (source[index] === '\\' && source[index + 1] === '$') {
      prose += '$';
      index++;
    } else if (source[index] === '$') {
      const end = closingDollar(source, index + 1);
      if (end > index + 1) {
        flush();
        result.push({ kind: 'math', text: source.slice(index + 1, end) });
        index = end;
      } else {
        prose += '$';
      }
    } else {
      prose += source[index];
    }
  }
  flush();
  return result;
}
