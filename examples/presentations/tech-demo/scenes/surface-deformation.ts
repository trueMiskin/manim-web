import { Surface3D, type Vector3Tuple } from 'manim-web';
import type { ColorPalette } from 'manim-web/reveal';

function surfacePoint(u: number, v: number, shape: number, phase: number): Vector3Tuple {
  const ripple = 0.7 * Math.sin(2 * u - phase) * Math.cos(2 * v);
  const saddle = 0.35 * (u * u - v * v);
  const height = shape <= 1 ? shape * ripple : (2 - shape) * ripple + (shape - 1) * saddle;
  return [u, v, height];
}

/** A sampled surface whose deformation is part of each playback checkpoint. */
export class DeformingSurface extends Surface3D {
  private shape: number;
  private phase: number;

  constructor(
    private readonly colors: ColorPalette,
    shape = 0,
    phase = 0,
  ) {
    super({
      func: (u, v) => surfacePoint(u, v, shape, phase),
      uRange: [-2.2, 2.2],
      vRange: [-2.2, 2.2],
      uResolution: 24,
      vResolution: 24,
      checkerboardColors: [colors.cyan, colors.surfaceShade],
    });
    this.shape = shape;
    this.phase = phase;
  }

  /** @pre 0 <= shape && shape <= 2 && Number.isFinite(phase) */
  setDeformation(shape: number, phase: number): this {
    if (this.shape === shape && this.phase === phase) return this;
    this.shape = shape;
    this.phase = phase;
    return this.setFunc((u, v) => surfacePoint(u, v, shape, phase));
  }

  override captureState(): Record<string, unknown> {
    return { shape: this.shape, phase: this.phase };
  }

  override restoreCapturedState(state: Record<string, unknown>): void {
    if (typeof state.shape === 'number' && typeof state.phase === 'number') {
      this.setDeformation(state.shape, state.phase);
    }
  }

  override copy(): DeformingSurface {
    const copy = new DeformingSurface(this.colors, this.shape, this.phase);
    this._copyBaseAttributesInto(copy, { copyChildren: false });
    return copy;
  }
}
