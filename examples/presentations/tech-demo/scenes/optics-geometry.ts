import { Vector3 } from 'three';
import { ArcBetweenPoints, Line, VMobject, VGroup, type Vector3Tuple } from '../../../../src';
import {
  addVec,
  subVec,
  scaleVec,
  normalizeVec,
  crossVec,
  dotVec,
} from '../../../../src/utils/vectors';
import { C } from './common';
import { resamplePointList3D } from '../../../../src/core/VMobjectTransformAlignment';

export type LensType = 'convex' | 'thick_convex' | 'concave';
export const hallVertices: Vector3Tuple[] = [
  [-3.5, -1.5, 0],
  [-3.5, 0.5, 0],
  [-2, 1.2, 0],
  [-2, 2.2, 0],
  [0.5, 2.2, 0],
  [3.5, 1.8, 0],
  [3.5, -0.6, 0],
  [1.5, -1.5, 0],
  [-3.5, -1.5, 0],
];

/** Source main.py:756–797. Shared-anchor cubic chains use the corrected core arcs. */
export function makeLens(type: LensType): VMobject {
  const angle =
    type === 'thick_convex' ? Math.PI / 2 : type === 'concave' ? Math.PI / 4 : Math.PI / 3.5;
  // Match top cap, right side, bottom cap, and left side across lens types.
  // The convex caps have zero length; they widen as the lens becomes concave.
  const halfCap = type === 'concave' ? 0.4 : 0;
  const sweep = type === 'concave' ? angle : -angle;
  const parts = [
    new Line({ start: [-halfCap, 1.5, 0], end: [halfCap, 1.5, 0] }),
    new ArcBetweenPoints({ start: [halfCap, 1.5, 0], end: [halfCap, -1.5, 0], angle: sweep }),
    new Line({ start: [halfCap, -1.5, 0], end: [-halfCap, -1.5, 0] }),
    new ArcBetweenPoints({ start: [-halfCap, -1.5, 0], end: [-halfCap, 1.5, 0], angle: sweep }),
  ];
  const points = parts.flatMap((part, index) => {
    const matrix = part._syncWorldMatrices().matrixWorld;
    // Line stores centered local points; translate them through its actual transform.
    const local = part.getLocalPoints();
    // Split the single concave cubic into two without changing its shape.
    // Equal side counts prevent whole-outline resampling from moving the corners.
    const points =
      part instanceof ArcBetweenPoints && local.length === 4
        ? resamplePointList3D(local, 7)
        : local;
    const world = points.map((point) =>
      new Vector3(point[0], point[1], point[2]).applyMatrix4(matrix).toArray(),
    );
    return index ? world.slice(1) : world;
  });
  parts.forEach((part) => part.dispose());
  return new VMobject().setPoints(points).setColor(C.cyan).setStrokeWidth(2).setFill(C.cyan, 0.2);
}

export function makeConcertHall(): VMobject {
  return new VMobject()
    .setPointsAsCorners(hallVertices)
    .setColor(C.text)
    .setStrokeWidth(2.5)
    .setFill(C.card, 0.4);
}

/** Source's illustrative prescribed-focal-distance construction, not a new optical solver. */
export function lensRayCoordinates(type: LensType): Vector3Tuple[][] {
  const concave = type === 'concave';
  const angle = concave ? Math.PI / 4 : type === 'convex' ? Math.PI / 3.5 : Math.PI / 2;
  const focal = concave ? -2 : type === 'convex' ? 2.5 : 1.3;
  const radius = 1.5 / Math.sin(angle / 2);
  const xc = Math.sqrt(radius ** 2 - 1.5 ** 2);
  return Array.from({ length: 7 }, (_, index) => {
    const y = -1.2 + (index * 2.4) / 6;
    if (Math.abs(y) < 1e-5)
      return [
        [-5, 0, 0],
        [4, 0, 0],
      ];
    const rightCenter = 0.4 + xc;
    const xLeft = concave
      ? -0.4 - xc + Math.sqrt(radius ** 2 - y ** 2)
      : xc - Math.sqrt(radius ** 2 - y ** 2);
    const middleSlope = 0.4 * (concave ? y / (0.4 + Math.abs(focal)) : -y / focal);
    const c = y - middleSlope * xLeft;
    const a = 1 + middleSlope ** 2;
    const b = 2 * ((concave ? -rightCenter : xc) + middleSlope * c);
    const quadraticC = (concave ? rightCenter : xc) ** 2 + c ** 2 - radius ** 2;
    const discriminant = b ** 2 - 4 * a * quadraticC;
    let xRight = -xLeft;
    let yExit = y;
    if (discriminant >= 0) {
      const roots = [
        (-b + Math.sqrt(discriminant)) / (2 * a),
        (-b - Math.sqrt(discriminant)) / (2 * a),
      ];
      xRight = concave ? Math.min(...roots) : Math.max(...roots);
      yExit = middleSlope * xRight + c;
    }
    const exit: Vector3Tuple = [xRight, yExit, 0];
    const focus: Vector3Tuple = [focal, 0, 0];
    const direction = normalizeVec(concave ? subVec(exit, focus) : subVec(focus, exit));
    return [[-5, y, 0], [xLeft, y, 0], exit, addVec(exit, scaleVec(concave ? 4 : 2.5, direction))];
  });
}

export function polyline(points: Vector3Tuple[], color = '#FFFF00', width = 1.5): VMobject {
  return new VMobject()
    .setPointsAsCorners(points)
    .setColor(color)
    .setStrokeWidth(width)
    .setFillOpacity(0);
}
export function lensRays(type: LensType): VGroup {
  return new VGroup(...lensRayCoordinates(type).map((points) => polyline(points)));
}

/** Source main.py:918–980; all hall segments and rays lie in the XY plane. */
function firstIntersection(
  origin: Vector3Tuple,
  direction: Vector3Tuple,
): { point: Vector3Tuple; edge: Vector3Tuple } | null {
  let nearest = Infinity;
  let result = null;
  for (let index = 0; index < hallVertices.length - 1; index++) {
    const start = hallVertices[index];
    const edge = subVec(hallVertices[index + 1], start);
    const denominator = crossVec(direction, edge)[2];
    if (Math.abs(denominator) < 1e-9) continue;
    const delta = subVec(start, origin);
    const distance = crossVec(delta, edge)[2] / denominator;
    const alongEdge = crossVec(delta, direction)[2] / denominator;
    if (distance > 1e-4 && distance < nearest && alongEdge >= 0 && alongEdge <= 1) {
      nearest = distance;
      result = { point: addVec(origin, scaleVec(distance, direction)), edge };
    }
  }
  return result;
}
export function traceHallRay(origin: Vector3Tuple, angle: number): Vector3Tuple[] {
  const direction: Vector3Tuple = [Math.cos(angle), Math.sin(angle), 0];
  const first = firstIntersection(origin, direction);
  if (!first) return [origin, addVec(origin, scaleVec(5, direction))];
  const normal = normalizeVec(crossVec([0, 0, 1], first.edge));
  const reflected = subVec(direction, scaleVec(2 * dotVec(direction, normal), normal));
  const second = firstIntersection(first.point, reflected);
  return [origin, first.point, second?.point ?? addVec(first.point, scaleVec(5, reflected))];
}
