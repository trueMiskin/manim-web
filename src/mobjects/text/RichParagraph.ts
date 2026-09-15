import { VGroup } from '../../core/VGroup';
import type { Vector3Tuple } from '../../core/Mobject';
import { DEFAULT_FONT_SIZE_IN_WORLD_SPACE, DEFAULT_FONT_SIZE_PT } from '../../constants/fontRender';
import { textGraphemes, type SemanticTextRun } from './TextSemantics';
import {
  ParagraphTextRun,
  ParagraphMathRun,
  parseInlineSource,
  type InlineMetrics,
} from './RichParagraphRuns';

export interface RichParagraphOptions {
  /** Prose with $inline LaTeX$. Escape a literal dollar as \$. */
  text: string;
  /** Available width in scene units, including text texture padding. */
  width: number;
  fontSize?: number;
  fontFamily?: string;
  fontUrl?: string;
  fontWeight?: string | number;
  color?: string;
  /** Baseline spacing multiplier; tall formulas expand their line. Default: 1.35. */
  lineHeight?: number;
}

type InlineRun = ParagraphTextRun | ParagraphMathRun;
type LayoutToken = { kind: 'run'; object: InlineRun; whitespace: boolean } | { kind: 'break' };
interface MeasuredRun {
  object: InlineRun;
  metrics: InlineMetrics;
}
interface LayoutLine {
  runs: MeasuredRun[];
  width: number;
  ascent: number;
  descent: number;
}

/**
 * Wrapping prose and inline math with shared baselines and ordinary mobject children.
 *
 * Await waitForRender() before measuring. Readiness and writing preserve child identities
 * and final geometry. Horizontal whitespace separates words; explicit newlines force
 * line breaks. Formulas and adjacent punctuation stay together. A word or formula wider
 * than the available line throws, so an author can widen the block or reduce fontSize.
 *
 * @example
 * const paragraph = new RichParagraph({
 *   text: String.raw`Choose a step size $\eta > 0$.`, width: 7, fontSize: 28,
 * });
 * await paragraph.waitForRender();
 */
export class RichParagraph extends VGroup {
  private _options: RichParagraphOptions;
  private _tokens: LayoutToken[] = [];
  private _renderPromise: Promise<void> | null = null;
  private _prepared = false;
  private _lineCount = 0;
  private _layoutBaseline = 0;
  private _revealProgress = 1;
  private _revealOpacities = new Map<InlineRun, number>();

  constructor(options: RichParagraphOptions, build = true) {
    super();
    assertPositive(options.width, 'width');
    assertPositive(options.fontSize ?? DEFAULT_FONT_SIZE_PT, 'fontSize');
    assertPositive(options.lineHeight ?? 1.35, 'lineHeight');
    this._options = { ...options };
    this.color = options.color ?? '#ffffff';
    this.disableChildZLayering();
    if (build) this._buildRuns();
  }

  getText(): string {
    return this._options.text;
  }

  getLayoutWidth(): number {
    return this._options.width;
  }

  getLineCount(): number {
    return this._lineCount;
  }

  /** First baseline y in the original layout frame, before later mobject transforms. */
  getLayoutBaseline(): number {
    if (!this._prepared) throw new Error('Prepare RichParagraph before reading its baseline.');
    return this._layoutBaseline;
  }

  /**
   * Configure wrapping before the first layout. Ready paragraphs retain their geometry.
   * @pre Number.isFinite(width) && width > 0
   * @post this.getLayoutWidth() === width
   */
  setWidth(width: number): this {
    assertPositive(width, 'width');
    if (width === this._options.width) return this;
    if (this._prepared || this._renderPromise) {
      throw new Error('Set RichParagraph width before preparing or animating it.');
    }
    this._options.width = width;
    return this;
  }

  /** Wait once for fonts, formula vectors and the resulting line layout. */
  waitForRender(): Promise<void> {
    return (this._renderPromise ??= this._prepare());
  }

  override getCenter(): Vector3Tuple {
    return this.isEmpty() ? this._localToWorld([0, 0, 0]) : super.getCenter();
  }

  /** Native Write animation reveals prose graphemes and fades each inline formula in order. */
  setRevealProgress(alpha: number): void {
    const progress = Math.max(0, Math.min(1, alpha));
    const runs = this._tokens.flatMap((token) => (token.kind === 'run' ? [token.object] : []));
    const lengths = runs.map((run) =>
      run instanceof ParagraphTextRun ? textGraphemes(run.getText()).length : 1,
    );
    let remaining = progress * lengths.reduce((total, length) => total + length, 0);
    runs.forEach((run, index) => {
      if (!this._revealOpacities.has(run)) this._revealOpacities.set(run, run.opacity);
      const length = lengths[index];
      if (run instanceof ParagraphTextRun) {
        run.setVisibleRange(0, Math.floor(Math.max(0, Math.min(length, remaining))));
      } else {
        run.setOpacity((this._revealOpacities.get(run) ?? 1) * Math.max(0, Math.min(1, remaining)));
      }
      remaining -= length;
    });
    this._revealProgress = progress;
    if (progress === 1) this._revealOpacities.clear();
  }

  /** Child semantics keep the same geometry used by native selection and print capture. */
  getSemanticTextRuns(): SemanticTextRun[] {
    return this._tokens.flatMap((token) =>
      token.kind === 'run' ? token.object.getSemanticTextRuns() : [],
    );
  }

  override captureState(): Record<string, unknown> {
    return { ...super.captureState(), revealProgress: this._revealProgress };
  }

  override restoreCapturedState(state: Record<string, unknown>): void {
    super.restoreCapturedState(state);
    if (typeof state.revealProgress === 'number') this._revealProgress = state.revealProgress;
  }

  override copy(): RichParagraph {
    const copy = new RichParagraph(this._options, false);
    this._copyBaseAttributesInto(copy, { copyChildren: false });
    const copyRuns = (): void => {
      copy._tokens = this._tokens.map((token): LayoutToken => {
        if (token.kind === 'break') return { kind: 'break' };
        const object = token.object.copy();
        copy.add(object);
        const opacity = this._revealOpacities.get(token.object);
        if (opacity !== undefined) copy._revealOpacities.set(object, opacity);
        return { ...token, object };
      });
      copy._prepared = true;
      copy.disableChildZLayering();
      copy._lineCount = this._lineCount;
      copy._layoutBaseline = this._layoutBaseline;
      copy._revealProgress = this._revealProgress;
    };
    if (this._prepared) {
      copyRuns();
      copy._renderPromise = Promise.resolve();
    } else {
      copy._renderPromise = this.waitForRender().then(copyRuns);
    }
    return copy;
  }

  private _buildRuns(): void {
    const {
      fontSize = DEFAULT_FONT_SIZE_PT,
      fontFamily,
      fontUrl,
      fontWeight,
      color,
    } = this._options;
    const parsed = parseInlineSource(this._options.text);
    const source = parsed.flatMap((token, index) =>
      token.kind === 'break' && (index === 0 || parsed[index - 1].kind === 'break')
        ? [{ kind: 'text' as const, text: '' }, token]
        : [token],
    );
    // Blank lines retain a line box so measuring the paragraph includes them.
    if (!source.length || source[source.length - 1].kind === 'break') {
      source.push({ kind: 'text', text: '' });
    }
    for (const token of source) {
      if (token.kind === 'break') {
        this._tokens.push({ kind: 'break' });
        continue;
      }
      const object =
        token.kind === 'math'
          ? new ParagraphMathRun({ latex: token.text, fontSize, color, displayMode: false })
          : new ParagraphTextRun({
              text: token.text,
              fontSize,
              fontFamily,
              fontUrl,
              fontWeight,
              color,
              lineHeight: 1,
              textAlign: 'left',
            });
      this.add(object);
      this._tokens.push({ kind: 'run', object, whitespace: /^\s+$/.test(token.text) });
    }
  }

  private async _prepare(): Promise<void> {
    await Promise.all(
      this._tokens.map((token) =>
        token.kind === 'run' ? token.object.waitForRender() : Promise.resolve(),
      ),
    );
    this.disableChildZLayering();
    this._layout();
    this._prepared = true;
  }

  private _layout(): void {
    const em =
      ((this._options.fontSize ?? DEFAULT_FONT_SIZE_PT) * DEFAULT_FONT_SIZE_IN_WORLD_SPACE) /
      DEFAULT_FONT_SIZE_PT;
    // Canvas Text uses 0.15 em of transparent padding on either side.
    const padding = em * 0.15 + 0.01;
    const available = this._options.width - 2 * padding;
    const lines: LayoutLine[] = [];
    const newLine = (): LayoutLine => ({ runs: [], width: 0, ascent: em * 0.8, descent: em * 0.2 });
    let line = newLine();
    let word: MeasuredRun[] = [];
    const flushWord = (): void => {
      if (!word.length) return;
      const width = word.reduce((sum, run) => sum + run.metrics.width, 0);
      if (width > available + 1e-8) {
        const content = word
          .map(({ object }) =>
            object instanceof ParagraphTextRun ? object.getText() : `$${object.getLatex()}$`,
          )
          .join('');
        throw new Error(
          `RichParagraph word or formula ${JSON.stringify(content)} exceeds width ${this._options.width}. Increase width or reduce fontSize.`,
        );
      }
      if (line.runs.length && line.width + width > available) {
        lines.push(line);
        line = newLine();
      }
      for (const run of word) {
        line.runs.push(run);
        line.width += run.metrics.width;
        line.ascent = Math.max(line.ascent, run.metrics.ascent);
        line.descent = Math.max(line.descent, run.metrics.descent);
      }
      word = [];
    };
    for (const token of this._tokens) {
      if (token.kind === 'break') {
        flushWord();
        lines.push(line);
        line = newLine();
      } else if (token.whitespace) {
        // Keep the space with the preceding word so even selectable whitespace fits.
        word.push({ object: token.object, metrics: token.object.measureInline() });
        flushWord();
      } else {
        word.push({ object: token.object, metrics: token.object.measureInline() });
      }
    }
    flushWord();
    lines.push(line);
    this._lineCount = lines.length;
    const gap = em * Math.max(0, (this._options.lineHeight ?? 1.35) - 1);
    const height =
      lines.reduce((sum, item) => sum + item.ascent + item.descent, 0) + gap * (lines.length - 1);
    let top = height / 2;
    this._layoutBaseline = top - lines[0].ascent;
    for (const item of lines) {
      let x = -this._options.width / 2 + padding;
      const baseline = top - item.ascent;
      for (const { object, metrics } of item.runs) {
        object.position.set(x - metrics.left, baseline - metrics.baseline, 0);
        object._markDirty();
        x += metrics.width;
      }
      top -= item.ascent + item.descent + gap;
    }
    this._markDirty();
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`RichParagraph ${name} must be a positive finite number.`);
  }
}
