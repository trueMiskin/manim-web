import type { Mobject } from '../../core/Mobject';

/** A user-perceived character and its offsets in the original source string. */
export interface Grapheme {
  text: string;
  start: number;
  end: number;
}

/** Segment source without splitting combining marks, surrogate pairs or emoji sequences. */
export function textGraphemes(source: string): Grapheme[] {
  const { Segmenter } = Intl as typeof Intl & {
    Segmenter: new (
      locales?: string[],
      options?: { granularity: 'grapheme' },
    ) => { segment(input: string): Iterable<{ segment: string; index: number }> };
  };
  if (!Segmenter) {
    throw new Error('Text animation requires Intl.Segmenter; install an Intl.Segmenter polyfill.');
  }
  return Array.from(
    new Segmenter(undefined, { granularity: 'grapheme' }).segment(source),
    (part) => ({
      text: part.segment,
      start: part.index,
      end: part.index + part.segment.length,
    }),
  );
}

/** Semantic content shared by selection, accessibility and checkpoint capture. */
export interface SemanticTextRun {
  id: string;
  mobjectId: string;
  kind: 'text' | 'math' | 'code';
  /** Code stays in the raster capture; HTML supplies selection and copy controls. */
  code?: {
    language: string;
    copyButton: boolean;
    tabWidth: number;
    lineCount: number;
  };
  /** Complete logical source; math source is LaTeX, not plain prose. */
  source: string;
  /** Currently visible content only. Math content is LaTeX. */
  text: string;
  /** UTF-16 source offsets, always on grapheme boundaries for prose. */
  sourceRange: [number, number];
  graphemeRange: [number, number];
  readingOrder: number;
  font: {
    family: string;
    /** Asset for this exact family; allows prebuilt handouts to register fonts. */
    url?: string;
    size: number;
    weight: string | number;
    style: string;
    lineHeight: number;
    /** Outline fonts describe glyph ink; canvas text describes its line box. */
    bounds?: 'ink';
    letterSpacing: number;
  };
  color: string;
  opacity: number;
  visible: boolean;
  /** Local world units; padding is already excluded. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Column-major local-to-world transform; project with the active camera. */
  matrixWorld: number[];
}

export interface CanvasTextRun {
  text: string;
  sourceOffset: number;
  x: number;
  y: number;
  width: number;
  height: number;
  font: SemanticTextRun['font'];
  color: string;
}

export function canvasSemanticRuns(
  mobject: Mobject,
  source: string,
  runs: CanvasTextRun[],
  canvas: { width: number; height: number } | null,
  worldWidth: number,
  worldHeight: number,
): SemanticTextRun[] {
  const object = mobject._syncWorldMatrices();
  const opacity = semanticOpacity(mobject) * mobject.fillOpacity;
  const pxX = worldWidth / (canvas?.width || 1);
  const pxY = worldHeight / (canvas?.height || 1);
  return runs.map((run, index) => ({
    id: `${mobject.id}:run:${index}`,
    mobjectId: mobject.id,
    kind: 'text',
    source,
    text: run.text,
    sourceRange: [run.sourceOffset, run.sourceOffset + run.text.length],
    graphemeRange: [
      textGraphemes(source.slice(0, run.sourceOffset)).length,
      textGraphemes(source.slice(0, run.sourceOffset + run.text.length)).length,
    ],
    readingOrder: index,
    font: run.font,
    color: run.color,
    opacity,
    visible: opacity > 0 && run.text.length > 0,
    bounds: {
      x: -worldWidth / 2 + run.x * pxX,
      y: worldHeight / 2 - (run.y + run.height) * pxY,
      width: run.width * pxX,
      height: run.height * pxY,
    },
    matrixWorld: object.matrixWorld.toArray(),
  }));
}

export function semanticOpacity(mobject: Mobject): number {
  const opacity = mobject.opacity;
  let node: Mobject | null = mobject;
  while (node) {
    if (node.opacity === 0 || !node.getThreeObject().visible) return 0;
    node = node.parent;
  }
  return opacity;
}

/** Find the end of a matching unit while balancing ordinary nested braces. */
function matchingGroupEnd(source: string, contentStart: number): number {
  let index = contentStart;
  let depth = 0;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (depth === 0 && source.slice(index, index + 2) === '}}') break;
    if (source[index] === '{') depth++;
    else if (source[index] === '}') depth--;
    index++;
  }
  return index;
}

/**
 * Parse Manim's explicit {{...}} matching units while retaining ungrouped text.
 * Only top-level groups outside command arguments are matching units.
 * Ordinary TeX braces within a unit are balanced and escaped braces are ignored.
 * @post result.length >= 1
 */
export function splitTexGroups(source: string): string[] {
  const parts: string[] = [];
  let plainStart = 0;
  let index = 0;
  let braceDepth = 0;
  while (index < source.length - 1) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    // A command, script operator, or preceding argument consumes the next
    // group as TeX syntax, even when that group contains another brace pair.
    const isMarker =
      braceDepth === 0 &&
      source.slice(index, index + 2) === '{{' &&
      !/(?:\\[a-zA-Z]+\*?|[_^}\]])\s*$/.test(source.slice(plainStart, index));
    if (!isMarker) {
      if (source[index] === '{') braceDepth++;
      else if (source[index] === '}') braceDepth--;
      index++;
      continue;
    }
    const start = index;
    index += 2;
    const contentStart = index;
    index = matchingGroupEnd(source, contentStart);
    if (index >= source.length) return [source];
    if (start > plainStart) parts.push(source.slice(plainStart, start));
    parts.push(source.slice(contentStart, index));
    index += 2;
    plainStart = index;
  }
  if (parts.length === 0) return [source];
  if (plainStart < source.length) parts.push(source.slice(plainStart));
  return parts;
}
