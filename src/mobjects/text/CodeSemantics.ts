import type { Mobject } from '../../core/Mobject';
import { canvasSemanticRuns, type SemanticTextRun } from './TextSemantics';

interface CodeSemanticLayout {
  canvas: { width: number; height: number } | null;
  worldWidth: number;
  worldHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  font: SemanticTextRun['font'];
  color: string;
  language: string;
  copyButton: boolean;
  tabWidth: number;
  lineCount: number;
}

/**
 * One logical source run preserves tabs and newlines independently of the canvas.
 * @post result.length === 1 && result[0].source === source && result[0].text === source
 */
export function codeSemanticRuns(
  mobject: Mobject,
  source: string,
  layout: CodeSemanticLayout,
): SemanticTextRun[] {
  const runs = canvasSemanticRuns(
    mobject,
    source,
    [
      {
        text: source,
        sourceOffset: 0,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        font: layout.font,
        color: layout.color,
      },
    ],
    layout.canvas,
    layout.worldWidth,
    layout.worldHeight,
  );
  return runs.map((run) => ({
    ...run,
    kind: 'code',
    code: {
      language: layout.language,
      copyButton: layout.copyButton,
      tabWidth: layout.tabWidth,
      lineCount: layout.lineCount,
    },
  }));
}
