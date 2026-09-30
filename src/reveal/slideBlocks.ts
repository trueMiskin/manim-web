import { VGroup } from '../core/VGroup';
import type { Mobject } from '../core/Mobject';
import { prepareMobjects } from '../core/readiness';
import { ParagraphTextRun } from '../mobjects/text/RichParagraphRuns';
import { MathTex, type MathTexOptions } from '../mobjects/text/MathTex';
import { RichParagraph, type RichParagraphOptions } from '../mobjects/text/RichParagraph';
import type { Code } from '../mobjects/text/Code';
import { createSlideCode, validateSlideCode, type SlideCodeOptions } from './slideCode';
import {
  SlideLayout,
  type LayoutRegion,
  type SlideAlignment,
  type SlidePlacement,
} from './slideLayout';
import { DEFAULT_SLIDE_THEME, slideColor, type SlideTheme } from './slideTheme';

export type { SlideCodeOptions } from './slideCode';

export interface SlideTextOptions {
  fontSize?: number;
  color?: string;
  align?: SlideAlignment;
}

export type SlideMathOptions = Omit<MathTexOptions, 'latex'> & { align?: SlideAlignment };

export interface SlideFigureOptions extends SlidePlacement {
  caption: string;
  captionOptions?: SlideTextOptions;
}

/** Independently animated graphic and caption; layout does not reparent either object. */
export interface SlideFigure<T extends Mobject = Mobject> {
  diagram: T;
  caption: RichParagraph;
}

class BulletRow extends VGroup {
  private prepared?: Promise<void>;

  constructor(
    private readonly bullet: ParagraphTextRun,
    private readonly content: RichParagraph,
    private readonly width: number,
  ) {
    super();
    this.add(bullet, content);
  }

  /** Prepare a whole row once so bullet and prose share one reveal target. */
  waitForRender(): Promise<void> {
    return (this.prepared ??= this.layoutRow());
  }

  private async layoutRow(): Promise<void> {
    await this.bullet.waitForRender();
    const bulletBounds = this.bullet.getBounds();
    const indent = bulletBounds.max.x - bulletBounds.min.x + 0.12;
    if (this.width <= indent) throw new Error('The bullet column is too narrow for its marker.');
    this.content.setWidth(this.width - indent);
    await prepareMobjects([this.content]);
    const bounds = this.content.getBounds();
    this.bullet.shift([
      -bulletBounds.min.x,
      this.content.getLayoutBaseline() - bounds.max.y - this.bullet.measureInline().baseline,
      0,
    ]);
    this.content.shift([indent - bounds.min.x, -bounds.max.y, 0]);
  }
}

/** Bullet rows retain independent identities for individual checkpoint reveals. */
export class SlideBullets {
  constructor(readonly items: readonly Mobject[]) {}

  /** @pre Number.isInteger(index) && index >= 0 && index < this.items.length */
  item(index: number): Mobject {
    const item = this.items[index];
    if (!Number.isInteger(index) || !item)
      throw new Error(`Bullet index ${index} is out of range.`);
    return item;
  }
}

/** A flow region within a slide; returned objects are ordinary animation targets. */
export class SlideRegion {
  constructor(
    protected readonly layout: SlideLayout,
    private readonly region: LayoutRegion,
  ) {}

  get theme(): Readonly<SlideTheme> {
    return this.layout.theme;
  }

  /** Inherited palette colors, including this slide's explicit color overrides. */
  get colors(): SlideTheme['colors'] {
    return this.theme.colors;
  }

  private textOptions(text: string, options: SlideTextOptions): RichParagraphOptions {
    return {
      text,
      width: this.region.width,
      fontSize: options.fontSize ?? this.theme.bodySize,
      fontFamily: this.theme.fontFamily,
      fontUrl: this.theme.fontUrl,
      color: slideColor(this.theme, options.color),
      lineHeight: this.theme.lineHeight,
    };
  }

  /** Declare wrapping prose with $inline math$; reveal it in a later step. */
  paragraph(text: string, options: SlideTextOptions = {}): RichParagraph {
    this.layout.assertOpen();
    const paragraph = new RichParagraph(this.textOptions(text, options));
    this.layout.add(this.region, paragraph, { align: options.align });
    return paragraph;
  }

  /** Declare a display formula, optionally using named and colored parts. */
  math(latex: MathTexOptions['latex'], options: SlideMathOptions = {}): MathTex {
    this.layout.assertOpen();
    const parts = Array.isArray(latex)
      ? latex.map((part) =>
          typeof part === 'string'
            ? part
            : {
                ...part,
                color: part.color === undefined ? undefined : slideColor(this.theme, part.color),
              },
        )
      : latex;
    const { align = 'center', ...mathOptions } = options;
    const math = new MathTex({
      ...mathOptions,
      latex: parts,
      fontSize: options.fontSize ?? this.theme.mathSize,
      color: slideColor(this.theme, options.color),
    });
    this.layout.add(this.region, math, { align });
    return math;
  }

  /**
   * Declare literal, selectable code with optional line numbers and a copy button.
   * Code shrinks to fit its region; fit: 'none' keeps the authored font size.
   * @post result.getCode() === source
   */
  code(source: string, options: SlideCodeOptions = {}): Code {
    this.layout.assertOpen();
    validateSlideCode(source, options);
    const { align = 'left', fit = 'contain', height, ...style } = options;
    const code = createSlideCode(source, this.theme, style);
    this.layout.add(this.region, code, { align, fit, height });
    return code;
  }

  /** Declare a list with wrapping and inline math, reserving space for every row. */
  bullets(items: readonly string[], options: SlideTextOptions = {}): SlideBullets {
    this.layout.assertOpen();
    if (items.length === 0) throw new Error('A bullet list needs at least one item.');
    // A whole list is one layout alternative when declared inside a slot.
    const list = this.layout.section(this.region);
    const rows = items.map((text, index) => {
      const content = new RichParagraph(this.textOptions(text, options));
      const bullet = new ParagraphTextRun({
        text: '•',
        fontFamily: this.theme.fontFamily,
        fontUrl: this.theme.fontUrl,
        fontSize: options.fontSize ?? this.theme.bodySize,
        color: slideColor(this.theme, options.color),
        lineHeight: this.theme.lineHeight,
      });
      const row = new BulletRow(bullet, content, this.region.width);
      this.layout.add(
        list,
        row,
        {},
        index < items.length - 1 ? this.theme.itemGap : this.theme.gap,
      );
      return row;
    });
    return new SlideBullets(rows);
  }

  /** Place one object or a diagram group; its children keep their relative geometry. */
  place<T extends Mobject>(object: T, options: SlidePlacement = {}): T {
    this.layout.add(this.region, object, { align: 'center', fit: 'contain', ...options });
    return object;
  }

  /**
   * Reserve one fixed area for alternatives declared before the first step.
   * Alternatives share their top edge and reserve their maximum height once.
   * Ordinary animations control which alternative is visible.
   */
  slot(): SlideRegion {
    return new SlideRegion(this.layout, this.layout.section(this.region, 'overlay'));
  }

  /**
   * Place a graphic with a wrapping caption below its reserved area.
   * Only the graphic scales to fit; the caption keeps its authored font size.
   * @post result.diagram === diagram
   */
  figure<T extends Mobject>(diagram: T, options: SlideFigureOptions): SlideFigure<T> {
    const { caption: text, captionOptions, ...placement } = options;
    const region = this.layout.section(this.region);
    this.layout.add(
      region,
      diagram,
      { align: 'center', fit: 'contain', ...placement },
      this.theme.captionGap ?? DEFAULT_SLIDE_THEME.captionGap,
    );
    const content = new SlideRegion(this.layout, region);
    const caption = content.paragraph(text, {
      fontSize:
        captionOptions?.fontSize ?? this.theme.captionSize ?? DEFAULT_SLIDE_THEME.captionSize,
      color: captionOptions?.color ?? 'muted',
      align: captionOptions?.align ?? 'center',
    });
    return { diagram, caption };
  }

  /** Create columns whose widths are proportional to the supplied weights. */
  columns(weights: readonly number[] = [1, 1]): SlideRegion[] {
    return this.layout
      .columns(this.region, weights)
      .map((region) => new SlideRegion(this.layout, region));
  }
}
