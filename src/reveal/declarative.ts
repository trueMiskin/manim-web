import type { Mobject } from '../core/Mobject';
import { ImageMobject } from '../mobjects/image';
import { assertId, sceneSlides } from './authoring';
import { contentBlocks, type LeafBlock, type SlideContent } from './declarativeBlocks';
import { defineSlide } from './defineSlide';
import type { SlideRegion } from './slideBlocks';
import type { SlideThemeOptions } from './slideTheme';
import type { SceneSlides, SlideAppearance } from './types';

export interface SlideBuild {
  id: string;
  /** Block IDs to show on this advance. Earlier content stays visible. */
  show: readonly string[];
  title?: string;
  notes?: string;
}

export interface DeclarativeSlideOptions extends SlideAppearance {
  title: string;
  content: SlideContent;
  theme?: SlideThemeOptions;
  /** Unreferenced blocks appear initially; named builds reveal the remaining blocks. */
  builds?: readonly SlideBuild[];
}

interface PreparedBlock {
  id?: string;
  objects: readonly Mobject[];
}

function visitTargets(content: SlideContent, visit: (block: { id?: string }) => void): void {
  for (const block of contentBlocks(content)) {
    if (block.kind === 'columns') block.content.forEach((column) => visitTargets(column, visit));
    else if (block.kind === 'bullets' && block.id === undefined) block.items.forEach(visit);
    else visit(block);
  }
}

/** Validate the document before allocating text, images, or a renderer. */
function validateBuilds(
  id: string,
  content: SlideContent,
  builds: readonly SlideBuild[],
): Set<string> {
  const names = new Set<string>();
  visitTargets(content, (block) => {
    if (block.id === undefined) return;
    assertId(block.id);
    if (names.has(block.id)) throw new Error(`Slide "${id}" has duplicate block ID "${block.id}".`);
    names.add(block.id);
  });
  const steps = new Set(['content']);
  const deferred = new Set<string>();
  for (const build of builds) {
    assertId(build.id);
    if (steps.has(build.id))
      throw new Error(`Slide "${id}" has duplicate or reserved build ID "${build.id}".`);
    steps.add(build.id);
    if (build.show.length === 0)
      throw new Error(`Build "${id}/${build.id}" has no blocks to show.`);
    for (const name of build.show) {
      if (!names.has(name))
        throw new Error(`Build "${id}/${build.id}" refers to unknown block "${name}".`);
      if (deferred.has(name))
        throw new Error(`Slide "${id}" reveals block "${name}" more than once.`);
      deferred.add(name);
    }
  }
  return deferred;
}

function prepareLeaf(
  region: SlideRegion,
  block: Exclude<LeafBlock, { kind: 'bullets' }>,
): readonly Mobject[] {
  switch (block.kind) {
    case 'paragraph':
      return [region.paragraph(block.text, block.options)];
    case 'math':
      return [region.math(block.latex, block.options)];
    case 'image': {
      const { caption, captionOptions, ...placement } = block.options;
      const graphic = new ImageMobject({ source: block.source, height: placement.height ?? 3 });
      if (caption === undefined) return [region.place(graphic, placement)];
      const figure = region.figure(graphic, { ...placement, caption, captionOptions });
      return [figure.diagram, figure.caption];
    }
  }
}

function prepareContent(region: SlideRegion, content: SlideContent): PreparedBlock[] {
  return contentBlocks(content).flatMap((block): PreparedBlock[] => {
    if (block.kind === 'columns') {
      const regions = region.columns(block.widths);
      return block.content.flatMap((column, index) => prepareContent(regions[index], column));
    }
    if (block.kind === 'bullets') {
      const rows = region.bullets(
        block.items.map((item) => item.text),
        block.options,
      );
      return block.id !== undefined
        ? [{ id: block.id, objects: rows.items }]
        : block.items.map((item, index) => ({ id: item.id, objects: [rows.item(index)] }));
    }
    return [{ id: block.id, objects: prepareLeaf(region, block) }];
  });
}

/**
 * Describe a complete slide. Content is visible by default and builds are additive.
 * Each build allocates fresh objects, so a document can be replayed or reused.
 * @post result.kind === 'scene' && result.id === id
 */
export function slide(id: string, options: DeclarativeSlideOptions): SceneSlides {
  assertId(id);
  const { content, theme, builds = [], ...appearance } = options;
  validateBuilds(id, content, builds);
  const definition = defineSlide({ title: options.title, theme }, async (s) => {
    try {
      const deferred = validateBuilds(id, content, builds);
      const blocks = prepareContent(s, content);
      const initial = blocks.filter((block) => block.id === undefined || !deferred.has(block.id));
      await s.step({ id: 'content', title: options.title, notes: options.notes }, () =>
        s.show(...initial.flatMap((block) => block.objects)),
      );
      const named = new Map(
        blocks.filter((block) => block.id !== undefined).map((block) => [block.id!, block.objects]),
      );
      for (const build of builds) {
        await s.step(
          { id: build.id, title: build.title, notes: build.notes ?? options.notes },
          () => s.show(...build.show.flatMap((name) => named.get(name)!)),
        );
      }
    } catch (error) {
      throw new Error(
        `Slide "${id}" (${options.title}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  return sceneSlides(id, async () => definition, appearance);
}
