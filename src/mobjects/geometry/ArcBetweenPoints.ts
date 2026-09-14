import { Arc } from './Arc';
import { Vector3Tuple } from '../../core/Mobject';
import { BLUE, DEFAULT_STROKE_WIDTH } from '../../constants';
import { addVec, crossVec, lengthVec, scaleVec, subVec } from '../../utils/vectors';

const STRAIGHT_ANGLE = 1e-10;

/**
 * Options for creating an ArcBetweenPoints
 */
export interface ArcBetweenPointsOptions {
  /** Start point of the arc */
  start: Vector3Tuple;
  /** End point of the arc */
  end: Vector3Tuple;
  /** Arc angle in radians. Zero produces a straight segment. Default: PI/2 */
  angle?: number;
  /** Stroke color as CSS color string. Default: Manim's blue (#58C4DD) */
  color?: string;
  /** Stroke width in pixels. Default: 4 (Manim's default) */
  strokeWidth?: number;
}

/**
 * ArcBetweenPoints - An arc that passes through two specified points
 *
 * Creates a circular arc from a start point to an end point with a given
 * arc angle. The center and radius are calculated automatically.
 *
 * @example
 * ```typescript
 * // Create an arc from (-1, 0) to (1, 0)
 * const arc = new ArcBetweenPoints({
 *   start: [-1, 0, 0],
 *   end: [1, 0, 0],
 *   angle: Math.PI / 2
 * });
 *
 * // Create a semicircle between two points
 * const semicircle = new ArcBetweenPoints({
 *   start: [0, 0, 0],
 *   end: [2, 0, 0],
 *   angle: Math.PI
 * });
 * ```
 */
export class ArcBetweenPoints extends Arc {
  private _startPoint: Vector3Tuple;
  private _endPoint: Vector3Tuple;

  constructor(options: ArcBetweenPointsOptions) {
    const {
      start,
      end,
      angle = Math.PI / 2,
      color = BLUE,
      strokeWidth = DEFAULT_STROKE_WIDTH,
    } = options;

    // Calculate the center and radius from the two points and angle
    const { center, radius, startAngle } = ArcBetweenPoints._calculateArcParams(start, end, angle);

    // Initialize the parent Arc with calculated parameters
    super({
      radius,
      startAngle,
      angle,
      color,
      strokeWidth,
      center,
    });

    this._startPoint = [...start];
    this._endPoint = [...end];

    // A zero sweep is the straight-line limit, not a zero-radius point.
    // Pin the anchors even for curved arcs to avoid cancellation when their
    // center lies far away compared with the length of the chord.
    const points = this.getLocalPoints();
    if (Math.abs(angle) < STRAIGHT_ANGLE) {
      const chord = subVec(end, start);
      this.setPoints([
        start,
        addVec(start, scaleVec(1 / 3, chord)),
        addVec(start, scaleVec(2 / 3, chord)),
        end,
      ]);
    } else {
      points[0] = [...start];
      points[points.length - 1] = [...end];
      this.setPoints(points);
    }
  }

  /**
   * Calculate the arc parameters (center, radius, startAngle) from two points and angle.
   *
   * Given two points and an arc angle, we find the circle that:
   * 1. Passes through both points
   * 2. The arc from start to end subtends the given angle
   *
   * The center lies on the perpendicular bisector of the chord between the points.
   * Like Arc, this calculation describes a circle parallel to the XY plane.
   * @pre start[2] === end[2]
   * @pre Math.abs(angle) < 2 * Math.PI
   */
  private static _calculateArcParams(
    start: Vector3Tuple,
    end: Vector3Tuple,
    angle: number,
  ): { center: Vector3Tuple; radius: number; startAngle: number } {
    // Handle degenerate case where angle is very small
    if (Math.abs(angle) < STRAIGHT_ANGLE) {
      const midpoint = scaleVec(0.5, addVec(start, end));
      return {
        center: midpoint,
        radius: 0,
        startAngle: 0,
      };
    }

    // Midpoint of the chord
    const midpoint = scaleVec(0.5, addVec(start, end));

    // Chord vector
    const chord = subVec(end, start);

    // Half chord length
    const halfChord = lengthVec(chord) / 2;

    // Handle degenerate case where points are the same
    if (halfChord < 1e-10) {
      return {
        center: [...start],
        radius: 0,
        startAngle: 0,
      };
    }

    // Distance from midpoint to center along perpendicular bisector
    // Using: halfChord = radius * sin(angle/2)
    // Therefore: radius = halfChord / sin(angle/2)
    const halfAngle = Math.abs(angle) / 2;
    const radius = halfChord / Math.sin(halfAngle);

    // Distance from midpoint to center
    // Using: d = radius * cos(angle/2)
    const distToCenter = radius * Math.cos(halfAngle);

    // Perpendicular direction to the chord (normalized)
    // Positive sweeps put the center to the left of the directed chord;
    // reversing the sign reflects the arc across the chord.
    const perpendicular = scaleVec(Math.sign(angle) / (2 * halfChord), crossVec([0, 0, 1], chord));

    // Calculate center position
    const center = addVec(midpoint, scaleVec(distToCenter, perpendicular));

    // Calculate start angle (angle from center to start point)
    const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);

    return { center, radius, startAngle };
  }

  /** Point along the circular arc, or the straight-line limit for a zero sweep. */
  override pointFromProportion(alpha: number): Vector3Tuple {
    if (Math.abs(this._angle) < STRAIGHT_ANGLE) {
      return addVec(this._startPoint, scaleVec(alpha, subVec(this._endPoint, this._startPoint)));
    }
    return super.pointFromProportion(alpha);
  }

  /** Arc length, including the straight-line limit for a zero sweep. */
  override getArcLength(): number {
    return Math.abs(this._angle) < STRAIGHT_ANGLE
      ? lengthVec(subVec(this._endPoint, this._startPoint))
      : super.getArcLength();
  }

  /**
   * Get the start point of the arc
   */
  override getStartPoint(): Vector3Tuple {
    return [...this._startPoint];
  }

  /**
   * Get the end point of the arc
   */
  override getEndPoint(): Vector3Tuple {
    return [...this._endPoint];
  }

  /**
   * Create a copy of this ArcBetweenPoints
   */
  override copy(): ArcBetweenPoints {
    const clone = new ArcBetweenPoints({
      start: this._startPoint,
      end: this._endPoint,
      angle: this._angle,
      color: this.color,
      strokeWidth: this.strokeWidth,
    });
    this._copyBaseAttributesInto(clone, { copyChildren: false, copyPosition: false });
    return clone;
  }
}
