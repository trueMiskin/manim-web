import * as THREE from 'three';
import type { Scene } from '../core/Scene';
import type { Mobject } from '../core/Mobject';
import type { SemanticTextRun } from '../mobjects/text/TextSemantics';
import { createCodeOverlay } from './codeSemantic';

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
        const corners = [
          origin,
          origin.clone().add(horizontal),
          origin.clone().add(vertical),
          origin.clone().add(horizontal).add(vertical),
        ];
        if (
          Math.max(...corners.map((point) => point.x)) <= 0 ||
          Math.min(...corners.map((point) => point.x)) >= width ||
          Math.max(...corners.map((point) => point.y)) <= 0 ||
          Math.min(...corners.map((point) => point.y)) >= height
        )
          continue;
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

function semanticFontLayout(run: ProjectedTextRun, context: CanvasRenderingContext2D | null) {
  let fontSize = ((run.height / run.font.lineHeight) * 4) / 3;
  const fontDeclaration = (size: number) =>
    `${run.font.style} ${run.font.weight} ${size}px ${run.font.family}`;
  const hasInkBounds = run.font.bounds === 'ink' && Boolean(run.text.trim());
  if (context && hasInkBounds) {
    context.font = fontDeclaration(100);
    const metrics = context.measureText(run.text);
    const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    if (inkHeight > 0) fontSize = (run.height * 100) / inkHeight;
  }
  const font = fontDeclaration(fontSize);
  if (context) context.font = font;
  const metrics = context?.measureText(run.text);
  const ink = hasInkBounds ? metrics : undefined;
  const naturalWidth =
    (ink && metrics
      ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
      : (metrics?.width ?? run.width)) +
    Math.max(0, Array.from(run.text).length - 1) * run.font.letterSpacing;
  const horizontalScale = naturalWidth > 0 ? run.width / naturalWidth : 1;
  // Canvas exposes the same font baseline metrics used by CSS inline layout.
  const bearing = ink && metrics ? metrics.actualBoundingBoxLeft * horizontalScale : 0;
  const baseline =
    ink && metrics && Number.isFinite(metrics.fontBoundingBoxAscent)
      ? metrics.actualBoundingBoxAscent -
        (run.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 -
        metrics.fontBoundingBoxAscent
      : 0;
  return { font, horizontalScale, bearing, baseline };
}

/** Build selectable HTML from the same runs used for capture. Math retains LaTeX semantics. */
export function appendSemanticText(
  container: HTMLElement,
  runs: readonly ProjectedTextRun[],
  options: { selectableOnly?: boolean } = {},
): void {
  const context = document.createElement('canvas').getContext('2d');
  for (const run of runs) {
    if (run.kind === 'code') {
      container.append(createCodeOverlay(run, context));
      continue;
    }
    const element = document.createElement('span');
    element.dataset.semanticId = run.id;
    element.dataset.kind = run.kind;
    element.textContent = run.text;
    const { font, horizontalScale, bearing, baseline } = semanticFontLayout(run, context);
    const [a, b, c, d, e, f] = run.transform;
    Object.assign(element.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      whiteSpace: 'pre',
      font,
      lineHeight: `${run.height}px`,
      letterSpacing: `${run.font.letterSpacing}px`,
      transformOrigin: '0 0',
      transform: `matrix(${a * horizontalScale},${b * horizontalScale},${c},${d},${e + a * bearing + c * baseline},${f + b * bearing + d * baseline})`,
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
