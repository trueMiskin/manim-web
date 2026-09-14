import * as THREE from 'three';
import type { Scene } from '../core/Scene';
import type { Mobject } from '../core/Mobject';
import type { SemanticTextRun } from '../mobjects/text/TextSemantics';

export interface ProjectedTextRun extends SemanticTextRun {
  width: number;
  height: number;
  transform: [number, number, number, number, number, number];
}

type SemanticMobject = Mobject & { getSemanticTextRuns?: () => SemanticTextRun[] };

/** Visible semantics only, projected through the active camera into logical canvas pixels. */
export function inspectSceneText(scene: Scene): ProjectedTextRun[] {
  const result: ProjectedTextRun[] = [];
  const visited = new Set<Mobject>();
  const width = scene.renderer.width;
  const height = scene.renderer.height;
  function visit(object: SemanticMobject): void {
    if (visited.has(object)) return;
    visited.add(object);
    if (object.getSemanticTextRuns) {
      const camera = scene.getCameraForMobject(object);
      camera.updateMatrixWorld();
      for (const run of object.getSemanticTextRuns()) {
        if (!run.visible || !run.text) continue;
        const matrix = new THREE.Matrix4().fromArray(run.matrixWorld);
        const { x, y, width: w, height: h } = run.bounds;
        const project = (px: number, py: number) => {
          const point = new THREE.Vector3(px, py, 0).applyMatrix4(matrix).project(camera);
          return new THREE.Vector2(((point.x + 1) * width) / 2, ((1 - point.y) * height) / 2);
        };
        const origin = project(x, y + h);
        const horizontal = project(x + w, y + h).sub(origin);
        const vertical = project(x, y).sub(origin);
        const projectedWidth = horizontal.length();
        const projectedHeight = vertical.length();
        if (projectedWidth < 0.01 || projectedHeight < 0.01) continue;
        result.push({
          ...run,
          readingOrder: result.length,
          width: projectedWidth,
          height: projectedHeight,
          transform: [
            horizontal.x / projectedWidth,
            horizontal.y / projectedWidth,
            vertical.x / projectedHeight,
            vertical.y / projectedHeight,
            origin.x,
            origin.y,
          ],
        });
      }
      return;
    }
    object.children.forEach(visit);
  }
  scene.mobjects.forEach(visit);
  return result;
}

/** Build selectable HTML from the same runs used for capture. Math retains LaTeX semantics. */
export function appendSemanticText(
  container: HTMLElement,
  runs: readonly ProjectedTextRun[],
  options: { selectableOnly?: boolean } = {},
): void {
  const context = document.createElement('canvas').getContext('2d');
  for (const run of runs) {
    const element = document.createElement('span');
    element.dataset.semanticId = run.id;
    element.dataset.kind = run.kind;
    element.textContent = run.text;
    const fontSize = ((run.height / run.font.lineHeight) * 4) / 3;
    const font = `${run.font.style} ${run.font.weight} ${fontSize}px ${run.font.family}`;
    if (context) context.font = font;
    const naturalWidth =
      (context?.measureText(run.text).width ?? run.width) +
      Math.max(0, Array.from(run.text).length - 1) * run.font.letterSpacing;
    const [a, b, c, d, e, f] = run.transform;
    const horizontalScale = naturalWidth > 0 ? run.width / naturalWidth : 1;
    Object.assign(element.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      whiteSpace: 'pre',
      font,
      lineHeight: `${run.height}px`,
      letterSpacing: `${run.font.letterSpacing}px`,
      transformOrigin: '0 0',
      transform: `matrix(${a * horizontalScale},${b * horizontalScale},${c},${d},${e},${f})`,
      color: options.selectableOnly || run.kind === 'math' ? 'transparent' : run.color,
      opacity: `${run.opacity}`,
      userSelect: 'text',
      pointerEvents: 'auto',
    });
    if (run.kind === 'math') {
      element.setAttribute('role', 'math');
      element.setAttribute('aria-label', run.text);
      element.title = `LaTeX: ${run.text}`;
      element.dataset.latex = run.text;
    }
    container.append(element);
  }
}
