import * as THREE from 'three';
import { Mobject } from './Mobject';

/**
 * Base class for mobjects that render via textured display meshes.
 *
 * Shape-morph code can use this contract to transfer texture/material state
 * without knowing the concrete textured subtype.
 */
export abstract class TexturedMobject extends Mobject {
  /**
   * Capture local visual dimensions independently of temporary morph geometry.
   * @post result.texturedVisualSize === undefined || result.texturedVisualSize.length === 2
   */
  override captureState(): Record<string, unknown> {
    const state = super.captureState();
    if (this.getDisplayMeshLength() !== 1) return state;
    const mesh = this.getDisplayMeshes()[0];
    if (mesh?.geometry instanceof THREE.PlaneGeometry && mesh.parent === this.getThreeObject()) {
      state.texturedVisualSize = [
        mesh.geometry.parameters.width * mesh.scale.x,
        mesh.geometry.parameters.height * mesh.scale.y,
      ];
    }
    return state;
  }

  /**
   * Restore authoritative dimensions as well as the display mesh size.
   * @post Array.isArray(state.texturedVisualSize) =>
   *   this.captureState().texturedVisualSize[0] === state.texturedVisualSize[0] &&
   *   this.captureState().texturedVisualSize[1] === state.texturedVisualSize[1]
   */
  override restoreCapturedState(state: Record<string, unknown>): void {
    super.restoreCapturedState(state);
    const size = state.texturedVisualSize;
    if (Array.isArray(size) && typeof size[0] === 'number' && typeof size[1] === 'number') {
      this.applyVisualSize(size[0], size[1]);
    }
  }

  /**
   * Return the meshes that visually represent this mobject.
   * Textured morph code can use this for strict single-mesh validation.
   */
  abstract override getDisplayMeshes(): THREE.Mesh[];

  /**
   * Return how many display meshes this textured mobject contributes.
   */
  abstract override getDisplayMeshLength(): number;

  /**
   * Copy texture/material-relevant state from another textured mobject.
   */
  abstract applyTextureFrom(other: TexturedMobject): void;

  /**
   * Update class-authoritative visual size state so later sync cycles do not
   * revert display dimensions set during transform finish.
   */
  abstract applyVisualSize(width: number, height: number): void;

  /**
   * Copy class-authoritative content metadata from another textured mobject so that
   * future sync cycles and API reads (e.g. getText()) reflect the target's content.
   */
  abstract applyContentFrom(other: TexturedMobject): void;

  /**
   * Flatten a textured leaf. Its geometry is a Three.js display mesh, not
   * bakeable points, so — like {@link Mobject3D} — it absolutizes rather than
   * resetting to identity: the local transform is set equal to the incoming
   * world matrix and re-applied to the mesh on every `_syncToThree`. Keeping the
   * scale on `scaleVector` (instead of folding it into the plane size and
   * resetting, as #417 had to) is inherently durable across async load / canvas
   * re-render, since those rebuild the geometry but not the Mobject transform.
   *
   * @post old.getBounds() === this.getBounds()  // world geometry preserved
   */
  override normalizeTransform(worldMatrix: THREE.Matrix4 = this._ownMatrix()): this {
    return this._flattenAsMesh(worldMatrix);
  }

  /**
   * Sets material.map, marks material dirty, and disposes previous texture when replaced.
   */
  protected _handoffTextureMap(
    material: THREE.MeshBasicMaterial,
    nextTexture: THREE.Texture | null,
    previousTexture: THREE.Texture | null,
  ): void {
    material.map = nextTexture;
    material.needsUpdate = true;
    if (previousTexture && previousTexture !== nextTexture) {
      previousTexture.dispose();
    }
  }
}
