import { splitTexGroups } from './TextSemantics';

/** An independently selectable and colorable semantic unit in a formula. */
export interface MathTexNamedPart {
  /** Stable identity used by part() and TransformMatchingTex. Must be unique. */
  key: string;
  /** A complete LaTeX fragment, such as `x^2` or `\\frac{a}{b}`. */
  latex: string;
  /** Optional CSS color for this part. */
  color?: string;
}

/** Normalize authored formula parts without changing legacy string matching. */
export function resolveMathTexParts(
  latex: string | Array<string | MathTexNamedPart>,
  matchingKeys?: string[],
) {
  const authoredParts = typeof latex === 'string' ? splitTexGroups(latex) : latex;
  const partLatex = authoredParts.map((part) => (typeof part === 'string' ? part : part.latex));
  const inferredKeys = authoredParts.map((part) => (typeof part === 'string' ? part : part.key));
  const keys = matchingKeys ? [...matchingKeys] : inferredKeys;
  if (keys.length !== partLatex.length) {
    throw new Error('MathTex matchingKeys must contain one key per semantic part.');
  }
  for (const [index, part] of authoredParts.entries()) {
    if (typeof part === 'string') continue;
    if (!part.key.trim()) throw new Error('MathTex named part keys must not be empty.');
    if (keys[index] !== part.key) {
      throw new Error(`MathTex matchingKeys conflicts with named part "${part.key}".`);
    }
    if (keys.indexOf(part.key) !== index || keys.lastIndexOf(part.key) !== index) {
      throw new Error(`MathTex named part key "${part.key}" must be unique.`);
    }
  }
  return {
    sourceLatex: typeof latex === 'string' ? latex : partLatex.join(''),
    partLatex,
    matchingKeys: keys,
    partColors: authoredParts.map((part) =>
      typeof part === 'string' ? null : (part.color ?? null),
    ),
  };
}
