import type { MathTexOptions } from '../mobjects/text/MathTex';
import type { SlideMathOptions, SlideTextOptions } from './slideBlocks';
import type { SlidePlacement } from './slideLayout';

/** A stable name for a block referenced by a slide's progressive builds. */
export interface ContentBlockOptions {
  id?: string;
}

export interface ParagraphBlock extends ContentBlockOptions {
  readonly kind: 'paragraph';
  readonly text: string;
  readonly options: SlideTextOptions;
}

export interface MathBlock extends ContentBlockOptions {
  readonly kind: 'math';
  readonly latex: MathTexOptions['latex'];
  readonly options: SlideMathOptions;
}

export interface BulletItem extends ContentBlockOptions {
  text: string;
}

export interface BulletsBlock extends ContentBlockOptions {
  readonly kind: 'bullets';
  readonly items: readonly BulletItem[];
  readonly options: SlideTextOptions;
}

export interface ImageBlockOptions extends ContentBlockOptions, SlidePlacement {
  caption?: string;
  captionOptions?: SlideTextOptions;
}

export interface ImageBlock extends ContentBlockOptions {
  readonly kind: 'image';
  readonly source: string;
  readonly options: Omit<ImageBlockOptions, 'id'>;
}

export interface ColumnsBlock {
  readonly kind: 'columns';
  readonly content: readonly SlideContent[];
  readonly widths: readonly number[];
}

export type LeafBlock = ParagraphBlock | MathBlock | BulletsBlock | ImageBlock;
export type ContentBlock = LeafBlock | ColumnsBlock;
export type SlideContent = ContentBlock | readonly ContentBlock[];

/** Describe wrapping prose, with optional $inline math$, without creating a scene. */
export function paragraph(
  text: string,
  options: SlideTextOptions & ContentBlockOptions = {},
): ParagraphBlock {
  const { id, ...style } = options;
  return { kind: 'paragraph', text, id, options: style };
}

/** Describe a display formula; named parts and palette roles use the ordinary math API. */
export function math(
  latex: MathTexOptions['latex'],
  options: SlideMathOptions & ContentBlockOptions = {},
): MathBlock {
  const { id, ...style } = options;
  return { kind: 'math', latex, id, options: style };
}

/** Describe a wrapping list; name the entire list or individual rows for builds. */
export function bullets(
  items: readonly (string | BulletItem)[],
  options: SlideTextOptions & ContentBlockOptions = {},
): BulletsBlock {
  if (items.length === 0) throw new Error('A bullet list needs at least one item.');
  const { id, ...style } = options;
  const rows = items.map((item) => (typeof item === 'string' ? { text: item } : { ...item }));
  if (id !== undefined && rows.some((row) => row.id !== undefined))
    throw new Error('Name either the bullet list or its individual items, not both.');
  return { kind: 'bullets', items: rows, id, options: style };
}

/** Describe an image and optional visible caption. Heights use scene units. */
export function image(source: string, options: ImageBlockOptions = {}): ImageBlock {
  if (!source.trim()) throw new Error('An image block needs a source.');
  if (options.height !== undefined && (!Number.isFinite(options.height) || options.height <= 0))
    throw new Error('An image height must be a positive finite number.');
  const { id, ...placement } = options;
  return { kind: 'image', source, id, options: placement };
}

/**
 * Arrange content in columns with proportional widths; each array flows vertically.
 * @pre content.length >= 2
 * @pre options.widths === undefined || options.widths.length === content.length
 * @pre options.widths === undefined || options.widths.every(width => Number.isFinite(width) && width > 0)
 */
export function columns(
  content: readonly SlideContent[],
  options: { widths?: readonly number[] } = {},
): ColumnsBlock {
  const widths = options.widths ?? content.map(() => 1);
  if (
    content.length < 2 ||
    widths.length !== content.length ||
    widths.some((width) => !Number.isFinite(width) || width <= 0)
  ) {
    throw new Error('Columns need at least two columns and one positive finite width per column.');
  }
  return {
    kind: 'columns',
    content: content.map((column) => (Array.isArray(column) ? [...column] : column)),
    widths: [...widths],
  };
}

/** Normalize a single layout block and a vertical list to the same traversal. */
export function contentBlocks(content: SlideContent): readonly ContentBlock[] {
  return Array.isArray(content) ? content : [content as ContentBlock];
}
