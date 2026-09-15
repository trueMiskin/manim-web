import type { Mobject } from '../core/Mobject';
import { prepareMobjects } from '../core/readiness';
import type { SlideTheme } from './slideTheme';

export type SlideAlignment = 'left' | 'center' | 'right';

/** Layout is metadata: regions never reparent the objects they position. */
export interface LayoutRegion {
  width: number;
  nodes: LayoutNode[];
}

interface LayoutBlock {
  kind: 'block';
  object: Mobject;
  align: SlideAlignment;
  fit: 'none' | 'contain';
  height?: number;
  gap: number;
}

interface LayoutColumns {
  kind: 'columns';
  regions: LayoutRegion[];
  gap: number;
}

type LayoutNode = LayoutBlock | LayoutColumns;

export interface SlidePlacement {
  align?: SlideAlignment;
  /** Graphics shrink to fit; prose and formulas keep their authored font size. */
  fit?: 'none' | 'contain';
  /** Optional space to reserve for a graphic, in scene units. */
  height?: number;
}

export class SlideLayout {
  readonly root: LayoutRegion;
  readonly objects = new Set<Mobject>();
  private locked = false;
  private readonly heights = new Map<LayoutNode, number>();

  constructor(
    private readonly frameWidth: number,
    private readonly frameHeight: number,
    readonly theme: SlideTheme,
    private readonly title: Mobject,
  ) {
    const width = frameWidth - 2 * theme.margin;
    if (!(width > 0) || !(frameHeight > 2 * theme.margin))
      throw new Error('Slide margins leave no space for content.');
    this.root = { width, nodes: [] };
  }

  /** @pre !this.locked */
  add(
    region: LayoutRegion,
    object: Mobject,
    options: SlidePlacement = {},
    gap = this.theme.gap,
  ): void {
    this.assertOpen();
    if (this.objects.has(object))
      throw new Error('An object can occupy only one slide layout slot.');
    if (object.parent) throw new Error('Place a diagram group, rather than one of its children.');
    if (options.height !== undefined && (!Number.isFinite(options.height) || options.height <= 0))
      throw new Error('A graphic height must be a positive finite number.');
    this.objects.add(object);
    region.nodes.push({
      kind: 'block',
      object,
      align: options.align ?? 'left',
      fit: options.fit ?? 'none',
      height: options.height,
      gap,
    });
  }

  /** @pre !this.locked && weights.every(weight => weight > 0) */
  columns(region: LayoutRegion, weights: readonly number[]): LayoutRegion[] {
    this.assertOpen();
    if (weights.length < 2 || weights.some((weight) => !Number.isFinite(weight) || weight <= 0))
      throw new Error('Columns need at least two positive finite weights.');
    const available = region.width - (weights.length - 1) * this.theme.columnGap;
    if (available <= 0) throw new Error('Column gaps leave no space for content.');
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const regions = weights.map((weight) => ({ width: (available * weight) / total, nodes: [] }));
    region.nodes.push({ kind: 'columns', regions, gap: this.theme.gap });
    return regions;
  }

  assertOpen(): void {
    if (this.locked)
      throw new Error(
        'Declare slide content before the first step or animation. Use a new slide for a new layout.',
      );
  }

  /** Prepare all declared blocks once, including the space reserved for future reveals. */
  async prepare(): Promise<void> {
    this.locked = true;
    await prepareMobjects([this.title, ...this.objects]);
    const left = -this.frameWidth / 2 + this.theme.margin;
    const top = this.frameHeight / 2 - this.theme.margin;
    const titleBounds = this.title.getBounds();
    if (titleBounds.max.x - titleBounds.min.x > this.root.width + 1e-6)
      throw new Error('Slide title exceeds the available width. Shorten it or reduce titleSize.');
    this.title.shift([left - titleBounds.min.x, top - titleBounds.max.y, 0]);
    const bodyTop = this.title.getBounds().min.y - this.theme.gap;
    const height = this.measure(this.root);
    if (height > bodyTop + this.frameHeight / 2 - this.theme.margin + 1e-6)
      throw new Error(
        'Slide content exceeds the available height. Split the content or reduce its size or spacing.',
      );
    this.position(this.root, left, bodyTop);
  }

  private measure(region: LayoutRegion): number {
    let total = 0;
    for (const [index, node] of region.nodes.entries()) {
      const height =
        node.kind === 'columns'
          ? Math.max(...node.regions.map((column) => this.measure(column)))
          : this.measureBlock(node, region.width);
      this.heights.set(node, height);
      total += height + (index < region.nodes.length - 1 ? node.gap : 0);
    }
    return total;
  }

  private measureBlock(block: LayoutBlock, width: number): number {
    if (block.object.isEmpty()) throw new Error('A slide layout block has no visible geometry.');
    const bounds = block.object.getBounds();
    const objectWidth = bounds.max.x - bounds.min.x;
    const objectHeight = bounds.max.y - bounds.min.y;
    if (block.fit === 'contain') {
      const widthScale = objectWidth > 0 ? width / objectWidth : 1;
      const heightScale =
        objectHeight > 0 && block.height !== undefined ? block.height / objectHeight : 1;
      const scale = Math.min(1, widthScale, heightScale);
      if (scale < 1) block.object.scale(scale);
    } else if (objectWidth > width + 1e-6) {
      throw new Error(
        'A slide block exceeds its column width. Shorten the content or reduce its font size.',
      );
    }
    const after = block.object.getBounds();
    return Math.max(block.height ?? 0, after.max.y - after.min.y);
  }

  private position(region: LayoutRegion, left: number, top: number): void {
    let cursor = top;
    for (const node of region.nodes) {
      const height = this.heights.get(node) ?? 0;
      if (node.kind === 'columns') {
        let columnLeft = left;
        for (const column of node.regions) {
          this.position(column, columnLeft, cursor);
          columnLeft += column.width + this.theme.columnGap;
        }
      } else {
        const bounds = node.object.getBounds();
        const width = bounds.max.x - bounds.min.x;
        const offset =
          node.align === 'center'
            ? (region.width - width) / 2
            : node.align === 'right'
              ? region.width - width
              : 0;
        const vertical = (height - (bounds.max.y - bounds.min.y)) / 2;
        node.object.shift([left + offset - bounds.min.x, cursor - vertical - bounds.max.y, 0]);
      }
      cursor -= height + node.gap;
    }
  }
}
