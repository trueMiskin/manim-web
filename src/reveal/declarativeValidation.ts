import { assertId } from './authoring';
import type { SlideBuild } from './declarative';
import {
  contentBlocks,
  slot,
  type LeafBlock,
  type SlideContent,
  type SlotBlock,
} from './declarativeBlocks';
import { validateEffect } from './declarativeEffects';

interface Target {
  id?: string;
  kind: LeafBlock['kind'];
  slot?: SlotBlock;
  hidden?: boolean;
}

function targets(content: SlideContent): Target[] {
  return contentBlocks(content).flatMap((block): Target[] => {
    if (block.kind === 'columns') return block.content.flatMap(targets);
    if (block.kind === 'slot') {
      slot(block.content);
      return block.content.map((formula, index) => ({
        id: formula.id,
        kind: formula.kind,
        slot: block,
        hidden: index > 0,
      }));
    }
    if (block.kind === 'bullets' && block.id === undefined)
      return block.items.map((item) => ({ id: item.id, kind: block.kind }));
    return [{ id: block.id, kind: block.kind }];
  });
}

function namedTargets(id: string, content: SlideContent): Map<string, Target> {
  const named = new Map<string, Target>();
  for (const target of targets(content)) {
    if (target.id === undefined) continue;
    assertId(target.id);
    if (named.has(target.id))
      throw new Error(`Slide "${id}" has duplicate block ID "${target.id}".`);
    named.set(target.id, target);
  }
  return named;
}

function buildReferences(build: SlideBuild, named: Map<string, Target>): string[] {
  const introduced = [...(build.show ?? [])];
  const involved = new Set(build.show);
  for (const effect of build.effects ?? []) {
    validateEffect(effect);
    for (const name of [effect.from, effect.to]) {
      if (named.get(name)?.kind !== 'math')
        throw new Error(`Formula transform "${name}" must refer to a math block.`);
      if (involved.has(name))
        throw new Error(`Block "${name}" is used more than once in the same build.`);
      involved.add(name);
    }
    introduced.push(effect.to);
  }
  if (introduced.length === 0) throw new Error('A build needs blocks to show or effects to play.');
  return introduced;
}

function validateSlots(named: Map<string, Target>, visible: Set<string>): void {
  const occupied = new Map<SlotBlock, string>();
  for (const name of visible) {
    const area = named.get(name)?.slot;
    if (!area) continue;
    const previous = occupied.get(area);
    if (previous !== undefined)
      throw new Error(`Slot formulas "${previous}" and "${name}" cannot be visible together.`);
    occupied.set(area, name);
  }
}

function validateVisibility(
  id: string,
  named: Map<string, Target>,
  deferred: Set<string>,
  builds: readonly SlideBuild[],
): void {
  const visible = new Set([...named.keys()].filter((name) => !deferred.has(name)));
  for (const build of builds) {
    try {
      for (const name of build.show ?? []) visible.add(name);
      for (const effect of build.effects ?? []) {
        if (!visible.has(effect.from))
          throw new Error(`Formula "${effect.from}" must be visible before it can transform.`);
        visible.delete(effect.from);
        visible.add(effect.to);
      }
      validateSlots(named, visible);
    } catch (error) {
      throw buildError(id, build.id, error);
    }
  }
}

/** Validate references and visibility before allocating text, images, or a renderer. */
export function validateBuilds(
  id: string,
  content: SlideContent,
  builds: readonly SlideBuild[],
): Set<string> {
  const named = namedTargets(id, content);
  const deferred = new Set([...named].filter(([, target]) => target.hidden).map(([name]) => name));
  const introduced = new Set<string>();
  const consumed = new Set<string>();
  const steps = new Set(['content']);
  for (const build of builds) {
    try {
      assertId(build.id);
      if (steps.has(build.id)) throw new Error('Duplicate or reserved build ID.');
      steps.add(build.id);
      for (const name of buildReferences(build, named)) {
        if (!named.has(name)) throw new Error(`Unknown block "${name}".`);
        if (introduced.has(name) || consumed.has(name))
          throw new Error(`Block "${name}" needs a fresh ID to be shown or targeted again.`);
        introduced.add(name);
        deferred.add(name);
      }
      for (const effect of build.effects ?? []) consumed.add(effect.from);
    } catch (error) {
      throw buildError(id, build.id, error);
    }
  }
  validateVisibility(id, named, deferred, builds);
  return deferred;
}

function buildError(slide: string, build: string, error: unknown): Error {
  return new Error(
    `Build "${slide}/${build}": ${error instanceof Error ? error.message : String(error)}`,
  );
}
