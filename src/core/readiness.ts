import type { Animation } from '../animation/Animation';
import { Mobject } from './Mobject';

interface PreparedMobject extends Mobject {
  waitForRender?: () => Promise<unknown>;
  waitForLoad?: () => Promise<unknown>;
  waitForReady?: () => Promise<unknown>;
}

/**
 * The mobjects an animation reads when it begins: its own mobject plus every
 * mobject it holds directly, such as a transform target.
 *
 * @post result[0] === animation.mobject
 * @post Object.values(animation).every((v) => !(v instanceof Mobject) || result.includes(v))
 */
export function animationMobjects(animation: Animation): Mobject[] {
  const fields: unknown[] = Object.values(animation);
  const held = fields.filter((value): value is Mobject => value instanceof Mobject);
  return [animation.mobject, ...held];
}

/** Await font metrics and recursively prepared geometry before measuring or capturing. */
export async function prepareMobjects(mobjects: Iterable<Mobject>): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  const seen = new Set<Mobject>();
  async function prepare(mobject: PreparedMobject): Promise<void> {
    if (seen.has(mobject)) return;
    seen.add(mobject);
    try {
      await mobject.waitForRender?.();
      await mobject.waitForLoad?.();
      await mobject.waitForReady?.();
      await Promise.all(mobject.children.map(prepare));
      mobject._syncToThree();
    } catch (cause) {
      throw new Error(
        `Unable to prepare ${mobject.constructor.name} (${mobject.id}): ${String(cause)}`,
      );
    }
  }
  await Promise.all(Array.from(mobjects, prepare));
}
