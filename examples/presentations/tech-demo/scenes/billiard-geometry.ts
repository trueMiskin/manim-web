import { type Vector3Tuple, addVec, subVec, scaleVec, dotVec, orientation2D } from 'manim-web';

// Adapted from BilliardTable, get_bounce_path and MLM clipping; see README attribution.
// helpers. Scientific coordinates remain the original 5 × 3.5 table.
export const TABLE_WIDTH = 5;
export const TABLE_HEIGHT = 3.5;
export const INITIAL_TX: Vector3Tuple = [-1.5, -0.595, 0];
export const INITIAL_RX: Vector3Tuple = [2.5, 1.75, 0];
export const MOVED_TX: Vector3Tuple = [0.5, -0.5, 0];
export const ROOM_CORNERS: Vector3Tuple[] = [
  [-2.5, -1.75, 0],
  [2.5, -1.75, 0],
  [2.5, 1.75, 0],
  [-2.5, 1.75, 0],
];
export type WallName = 'left' | 'right' | 'bottom' | 'top';
export interface Cushion {
  name: WallName;
  start: Vector3Tuple;
  end: Vector3Tuple;
  point: Vector3Tuple;
  normal: Vector3Tuple;
}
export const CUSHIONS: Cushion[] = [
  {
    name: 'left',
    start: ROOM_CORNERS[3],
    end: ROOM_CORNERS[0],
    point: [-2.5, 0, 0],
    normal: [1, 0, 0],
  },
  {
    name: 'right',
    start: ROOM_CORNERS[1],
    end: ROOM_CORNERS[2],
    point: [2.5, 0, 0],
    normal: [-1, 0, 0],
  },
  {
    name: 'bottom',
    start: ROOM_CORNERS[0],
    end: ROOM_CORNERS[1],
    point: [0, -1.75, 0],
    normal: [0, 1, 0],
  },
  {
    name: 'top',
    start: ROOM_CORNERS[2],
    end: ROOM_CORNERS[3],
    point: [0, 1.75, 0],
    normal: [0, -1, 0],
  },
];
export const SEQUENCES = CUSHIONS.flatMap((_, first) =>
  CUSHIONS.flatMap((__, second) => (first === second ? [] : [[first, second]])),
);
export const PALETTE = [
  '#EF5350',
  '#42A5F5',
  '#66BB6A',
  '#AB47BC',
  '#FF8A65',
  '#26C6DA',
  '#D4E157',
  '#7E57C2',
  '#FFB300',
  '#F48FB1',
  '#29B6F6',
  '#9CCC65',
];

export function cushion(name: WallName): Cushion {
  return CUSHIONS.find((wall) => wall.name === name)!;
}
export function mix(a: Vector3Tuple, b: Vector3Tuple, alpha: number): Vector3Tuple {
  return addVec(a, scaleVec(alpha, subVec(b, a)));
}
export function reflectPoint(point: Vector3Tuple, wall: Cushion | WallName): Vector3Tuple {
  const { point: origin, normal } = typeof wall === 'string' ? cushion(wall) : wall;
  return subVec(point, scaleVec(2 * dotVec(subVec(point, origin), normal), normal));
}
export function wallIntersection(
  start: Vector3Tuple,
  target: Vector3Tuple,
  wall: WallName,
): Vector3Tuple {
  const { point, normal } = cushion(wall);
  const direction = subVec(target, start);
  const denominator = dotVec(direction, normal);
  return Math.abs(denominator) < 1e-12
    ? [...point]
    : addVec(start, scaleVec(dotVec(subVec(point, start), normal) / denominator, direction));
}
export function reflectionPath(tx: Vector3Tuple, walls: WallName[], rx = INITIAL_RX) {
  const images = [tx];
  for (const wall of walls) images.push(reflectPoint(images[images.length - 1], wall));
  const bounces: Vector3Tuple[] = new Array(walls.length);
  let target = rx;
  for (let index = walls.length - 1; index >= 0; index--) {
    target = wallIntersection(target, images[index + 1], walls[index]);
    bounces[index] = target;
  }
  const valid = bounces.every((point, index) => {
    const axis = walls[index] === 'left' || walls[index] === 'right' ? 1 : 0;
    return Math.abs(point[axis]) <= (axis ? TABLE_HEIGHT : TABLE_WIDTH) / 2 + 1e-8;
  });
  return { images, bounces, points: [tx, ...bounces, rx], valid };
}
export function bouncePath(tx: Vector3Tuple, angle: number): Vector3Tuple[] {
  let position: Vector3Tuple = [...tx];
  const direction: Vector3Tuple = [Math.cos(angle), Math.sin(angle), 0];
  const points: Vector3Tuple[] = [[...position]];
  for (let bounce = 0; bounce < 2; bounce++) {
    let nearest = Infinity;
    let normalAxis = -1;
    for (let axis = 0; axis < 2; axis++) {
      if (Math.abs(direction[axis]) < 1e-8) continue;
      const extent = (axis ? TABLE_HEIGHT : TABLE_WIDTH) / 2;
      const distance = (Math.sign(direction[axis]) * extent - position[axis]) / direction[axis];
      if (distance > 1e-5 && distance < nearest) {
        nearest = distance;
        normalAxis = axis;
      }
    }
    if (normalAxis < 0) throw new Error('Ray does not intersect a cushion');
    position = addVec(position, scaleVec(nearest, direction));
    points.push([...position]);
    direction[normalAxis] *= -1;
  }
  return points;
}

// These predicates are genuinely planar: each authored room and clipping
// half-plane lies in the XY plane. orientation2D shares the core convention.
export function clipPolygon(
  poly: Vector3Tuple[],
  p1: Vector3Tuple,
  p2: Vector3Tuple,
): Vector3Tuple[] {
  const inside = (point: Vector3Tuple) => orientation2D(p1, p2, point) >= -1e-8;
  const intersect = (start: Vector3Tuple, end: Vector3Tuple): Vector3Tuple => {
    const a = orientation2D(p1, p2, start);
    const b = orientation2D(p1, p2, end);
    return Math.abs(a - b) < 1e-10 ? start : mix(start, end, a / (a - b));
  };
  const output: Vector3Tuple[] = [];
  for (let index = 0; index < poly.length; index++) {
    const current = poly[index],
      previous = poly[(index + poly.length - 1) % poly.length];
    if (inside(current)) {
      if (!inside(previous)) output.push(intersect(previous, current));
      output.push(current);
    } else if (inside(previous)) output.push(intersect(previous, current));
  }
  return output;
}
function clipSegment(
  a: Vector3Tuple,
  b: Vector3Tuple,
  p1: Vector3Tuple,
  p2: Vector3Tuple,
): [Vector3Tuple, Vector3Tuple] | null {
  const sa = orientation2D(p1, p2, a),
    sb = orientation2D(p1, p2, b);
  if (sa >= -1e-8 && sb >= -1e-8) return [a, b];
  if (sa < -1e-8 && sb < -1e-8) return null;
  const intersection = mix(a, b, sa / (sa - sb));
  return sa >= -1e-8 ? [a, intersection] : [intersection, b];
}
function wedgeEdges(
  origin: Vector3Tuple,
  a: Vector3Tuple,
  b: Vector3Tuple,
): [[Vector3Tuple, Vector3Tuple], [Vector3Tuple, Vector3Tuple]] {
  return [
    orientation2D(origin, a, b) > 0 ? [origin, a] : [a, origin],
    orientation2D(origin, b, a) > 0 ? [origin, b] : [b, origin],
  ];
}
export function computeSecondOrderPolygon(
  tx: Vector3Tuple,
  first: Cushion,
  second: Cushion,
): Vector3Tuple[] {
  const image = reflectPoint(tx, first),
    secondImage = reflectPoint(image, second);
  const edges = wedgeEdges(image, first.start, first.end);
  let segment = clipSegment(second.start, second.end, ...edges[0]);
  if (!segment) return [];
  segment = clipSegment(...segment, ...edges[1]);
  if (!segment) return [];
  const wedge = wedgeEdges(secondImage, ...segment);
  return clipPolygon(clipPolygon(ROOM_CORNERS, ...wedge[0]), ...wedge[1]);
}
export function getAllPolygons(tx: Vector3Tuple): Vector3Tuple[][] {
  return SEQUENCES.map(([first, second]) =>
    computeSecondOrderPolygon(tx, CUSHIONS[first], CUSHIONS[second]),
  );
}
export function transmitterTrajectory(theta: number): Vector3Tuple {
  return addVec(INITIAL_TX, [0.6 + 0.6 * Math.cos(theta), 0.525 * Math.sin(theta), 0]);
}
