import type { TransformMatchingTexOptions } from '../animation/transform/TransformMatching';
import { assertId } from './authoring';

/** Matching and timing options; named formula parts control which symbols correspond. */
export type TransformMathOptions = Pick<
  TransformMatchingTexOptions,
  'duration' | 'rateFunc' | 'fadeRatio' | 'transformMismatches'
>;

export interface TransformMathEffect {
  readonly kind: 'transformMath';
  readonly from: string;
  readonly to: string;
  readonly options: TransformMathOptions;
}

export type SlideEffect = TransformMathEffect;

/**
 * Morph a visible formula into a fresh, hidden formula on this advance.
 * @pre from !== to
 * @pre options.duration === undefined || (Number.isFinite(options.duration) && options.duration > 0)
 * @post result.kind === 'transformMath' && result.from === from && result.to === to
 */
export function transformMath(
  from: string,
  to: string,
  options: TransformMathOptions = {},
): TransformMathEffect {
  const effect: TransformMathEffect = { kind: 'transformMath', from, to, options: { ...options } };
  validateEffect(effect);
  return effect;
}

/** Validate again when compiling so mutated descriptors cannot bypass the checks. */
export function validateEffect(effect: SlideEffect): void {
  assertId(effect.from);
  assertId(effect.to);
  if (effect.from === effect.to) throw new Error('A formula transform needs two different IDs.');
  const { duration, fadeRatio } = effect.options;
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))
    throw new Error('A formula transform duration must be a positive finite number.');
  if (fadeRatio !== undefined && (!Number.isFinite(fadeRatio) || fadeRatio < 0 || fadeRatio > 0.5))
    throw new Error('A formula transform fadeRatio must be between 0 and 0.5.');
}
