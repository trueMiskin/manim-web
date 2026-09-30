import type { Mobject } from '../core/Mobject';
import { ImageMobject } from '../mobjects/image';
import { MathTex } from '../mobjects/text/MathTex';
import { TransformMatchingTex } from '../animation/transform/TransformMatching';
import { assertId, sceneSlides } from './authoring';
import { contentBlocks, type LeafBlock, type SlideContent } from './declarativeBlocks';
import type { SlideEffect } from './declarativeEffects';
import { validateBuilds } from './declarativeValidation';
import { defineSlide } from './defineSlide';
import type { SlideRegion } from './slideBlocks';
import type { SlideThemeOptions } from './slideTheme';
import type { SceneSlides, SlideAppearance } from './types';

export interface SlideBuild {
  id: string;
  /** Block IDs to show immediately at the start of this advance. */
  show?: readonly string[];
  /** Effects run together after show; this build ends at one navigation pause. */
  effects?: readonly SlideEffect[];
  title?: string;
  notes?: string;
}

export interface DeclarativeSlideOptions extends SlideAppearance {
  title: string;
  content: SlideContent;
  theme?: SlideThemeOptions;
  /** Named builds reveal content or transform formulas. Destinations start hidden. */
  builds?: readonly SlideBuild[];
}

interface PreparedBlock {
  id?: string;
  objects: readonly Mobject[];
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
    case 'code':
      return [region.code(block.source, block.options)];
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
    if (block.kind === 'slot') return prepareContent(region.slot(), block.content);
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
 * Describe a complete slide with named reveals and formula transformations.
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
          async () => {
            await s.show(...(build.show ?? []).flatMap((name) => named.get(name)!));
            const effects = (build.effects ?? []).map((effect) => {
              const from = named.get(effect.from)![0];
              const to = named.get(effect.to)![0];
              if (!(from instanceof MathTex) || !(to instanceof MathTex))
                throw new Error('Formula transforms require prepared math blocks.');
              return new TransformMatchingTex(from, to, {
                ...effect.options,
                duration: effect.options.duration ?? s.theme.duration,
              });
            });
            if (effects.length > 0) await s.play(...effects);
          },
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
