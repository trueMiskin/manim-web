import { Color } from 'three';
import {
  Arrow,
  Dot,
  Group,
  ImageMobject,
  Mobject,
  Rectangle,
  Text,
  UpdateFromAlphaFunc,
  linear,
  type Animation,
} from '../../../../src';
import type { RecordingScene } from '../../../../src/player/RecordingScene';
import fieldData from '../data/states.json';
import { SOURCE_FONT } from './source-font';

export const palette = {
  text: '#F3F4F6',
  cyan: '#00FFFF',
  green: '#00E676',
  red: '#FF1744',
  amber: '#FFB300',
  muted: '#8996A6',
};
export type FieldState = (typeof fieldData.states)[number];
const statesById = new Map(fieldData.states.map((state) => [state.id, state]));
export const smoothingStates = fieldData.states.filter((state) => state.id.endsWith('-smoothing'));

export function fieldState(id: string): FieldState {
  const state = statesById.get(id);
  if (!state) throw new Error(`Missing demo field state: ${id}`);
  return state;
}

export type Point = [number, number, number];
// Use scene-local coordinates for the table, heatmaps, vectors, and trajectories.
export const tableCenter: Point = [0, 0, 0];

export function point(value: readonly number[], offset: Point = tableCenter): Point {
  return [value[0] + offset[0], value[1] + offset[1], (value[2] ?? 0) + offset[2]];
}

export function text(value: string, location: Point, fontSize = 25, color = palette.text): Text {
  return new Text({
    text: value,
    fontSize,
    color,
    ...SOURCE_FONT,
    textAlign: 'left',
  }).moveTo(location);
}

export function makeTable(obstacleVisible = true): {
  base: Group;
  frame: Rectangle;
  tx: Dot;
  txLabel: Text;
  rxLabel: Text;
  pockets: Dot[];
} {
  const frame = new Rectangle({
    width: 5,
    height: 3.5,
    color: '#4E3629',
    strokeWidth: 6,
    fillOpacity: 1,
    center: tableCenter,
  });
  frame.setStyle({ fillColor: '#0D3B2E', fillOpacity: 1 });
  const rim = new Rectangle({
    width: 5.32,
    height: 3.82,
    color: '#8E9296',
    strokeWidth: 10,
    center: tableCenter,
  });
  const obstacle = new Rectangle({
    width: 1.2,
    height: 1,
    color: '#30363D',
    strokeWidth: 2,
    fillOpacity: 1,
    center: point([0, 0, 0.04]),
  });
  obstacle.setStyle({ fillColor: '#22252A', fillOpacity: 1 });
  const obstacleLabel = text('Obstacle', point([0, 0, 0.05]), 14, palette.muted);
  const pockets = [
    [-2.5, 1.75],
    [2.5, 1.75],
    [-2.5, -1.75],
    [2.5, -1.75],
  ].map(
    (location) => new Dot({ point: point([...location, 0.04]), radius: 0.12, color: '#000000' }),
  );
  const tx = new Dot({ point: point([-1.5, -0.595, 0.08]), radius: 0.1, color: '#FFFFFF' });
  const txLabel = text('TX', point([-1.5, -0.595, 0.1]), 12, '#000000');
  const rxLabel = text('RX', point([2.5, 1.45, 0.1]), 12);
  return {
    base: new Group(
      rim,
      frame,
      ...(obstacleVisible ? [obstacle, obstacleLabel] : []),
      ...pockets,
      tx,
      txLabel,
      rxLabel,
    ),
    frame,
    tx,
    txLabel,
    rxLabel,
    pockets,
  };
}

/** Match the source's map/vector (1/2), transmitter (5/6), and pocket (6) layers. */
export function fieldForeground(
  scene: RecordingScene,
  table: ReturnType<typeof makeTable>,
  vectors: Group,
  receivers: readonly Mobject[] = [],
): void {
  scene.scene.addForegroundMobject(
    vectors,
    table.tx,
    table.txLabel,
    ...table.pockets,
    ...receivers,
  );
}

export function heatmap(state: FieldState): ImageMobject {
  return new ImageMobject({
    source: new URL(`../data/heatmaps/${state.id}.png`, import.meta.url).href,
    width: 5,
    height: 3.5,
    scaleToFit: false,
    center: point([0, 0, 0.02]),
    opacity: 0.85,
    resampling: 'nearest',
  });
}

export function vectorField(state: FieldState): Group {
  return new Group(
    ...state.arrows.map((arrow) => {
      const result = new Arrow({
        start: point(arrow.start),
        end: point(arrow.end),
        color: arrow.color,
        strokeWidth: 3.5,
        tipLength: 0.0625,
        tipWidth: 0.03,
      });
      result.opacity = arrow.opacity;
      return result;
    }),
  );
}

export function opacity(
  object: Mobject,
  from: number,
  to: number,
  duration = 1,
): UpdateFromAlphaFunc {
  return new UpdateFromAlphaFunc(
    object,
    (mob, alpha) => {
      mob.opacity = from + (to - from) * alpha;
    },
    { duration },
  );
}

export function fieldTransition(
  field: Group,
  from: FieldState,
  to: FieldState,
  duration = 1,
): UpdateFromAlphaFunc {
  const colors = from.arrows.map((arrow, index) => [
    new Color(arrow.color),
    new Color(to.arrows[index].color),
  ]);
  return new UpdateFromAlphaFunc(
    field,
    (_mob, alpha) => {
      field.children.forEach((child, index) => {
        const arrow = child as Arrow;
        const start = from.arrows[index];
        const end = to.arrows[index];
        arrow.putStartAndEndOn(
          point(start.start.map((value, axis) => value + (end.start[axis] - value) * alpha)),
          point(start.end.map((value, axis) => value + (end.end[axis] - value) * alpha)),
        );
        arrow.setColor(`#${colors[index][0].clone().lerp(colors[index][1], alpha).getHexString()}`);
        arrow.opacity = start.opacity + (end.opacity - start.opacity) * alpha;
      });
    },
    { duration, rateFunc: linear },
  );
}

export async function changeField(
  scene: RecordingScene,
  previous: ImageMobject,
  next: ImageMobject,
  vectors: Group,
  from: FieldState,
  to: FieldState,
  duration = 1,
  extra: Animation[] = [],
): Promise<void> {
  next.opacity = 0;
  scene.add(next);
  await scene.play(
    opacity(previous, 0.85, 0, duration),
    opacity(next, 0, 0.85, duration),
    fieldTransition(vectors, from, to, duration),
    ...extra,
  );
  scene.remove(previous);
}
