import {
  Circle,
  Dot,
  Group,
  Line,
  Polygon,
  Rectangle,
  RoundedRectangle,
  type Vector3Tuple,
} from '../../../../src/index';
import { addVec, scaleVec } from '../../../../src/utils/vectors';
import type { ColorPalette } from '../../../../src/reveal';
import { label } from './common';
import {
  cushion,
  INITIAL_RX,
  INITIAL_TX,
  ROOM_CORNERS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  type WallName,
} from './billiard-geometry';

/** Build a table and its geometry in one fixed coordinate system. */
export function billiardTable(colors: ColorPalette, center: Vector3Tuple = [0, 0, 0], scale = 1) {
  const rim = new RoundedRectangle({
    width: 5.32 * scale,
    height: 3.82 * scale,
    cornerRadius: 0.2,
    color: '#8E9296',
    strokeWidth: 5,
    fillOpacity: 0,
  }).moveTo(center);
  const frame = new Rectangle({
    width: TABLE_WIDTH * scale,
    height: TABLE_HEIGHT * scale,
    color: '#7B583D',
    strokeWidth: 7,
    fillOpacity: 1,
  })
    .setFill(colors.tableSurface, 1)
    .moveTo(center);
  const project = (point: Vector3Tuple): Vector3Tuple => addVec(center, scaleVec(scale, point));
  const pockets = ROOM_CORNERS.map(
    (point) => new Dot({ point: project(point), radius: 0.095, color: '#000000' }),
  );
  const cue = new Dot({ point: project(INITIAL_TX), radius: 0.12, color: colors.text });
  const txLabel = label('TX', 16, colors.text, addVec(project(INITIAL_TX), [0, 0.3, 0]));
  const rxLabel = label('RX', 16, colors.text, addVec(project(INITIAL_RX), [-0.03, -0.28, 0]));
  const objects = new Group(rim, frame, ...pockets, cue, txLabel, rxLabel);
  const path = (points: Vector3Tuple[], color: string, width = 2.5) =>
    new Polygon({
      vertices: points.map(project),
      closed: false,
      color,
      strokeWidth: width,
      fillOpacity: 0,
    });
  const marker = (point: Vector3Tuple, color = colors.cyan) =>
    new Circle({ radius: 0.08, color, fillOpacity: 0.6, strokeWidth: 1.5 }).moveTo(project(point));
  const wall = (name: WallName, color: string) => {
    const item = cushion(name);
    return new Line({ start: project(item.start), end: project(item.end), color, strokeWidth: 6 });
  };
  return { objects, rim, frame, pockets, cue, txLabel, rxLabel, project, path, marker, wall };
}
