import * as THREE from 'three';

// Scene type is explicit: an orthographic camera can also render 3D geometry.
const planarScenes = new WeakSet<THREE.Scene>();

/** Select the draw policy independently of camera projection. */
export function setSceneComposition(scene: THREE.Scene, mode: '2d' | '3d'): void {
  if (mode === '2d') planarScenes.add(scene);
  else planarScenes.delete(scene);
}

/**
 * Apply painter's ordering immediately before a render, after geometry sync.
 * Newly created children and materials inherit their scene root's draw order.
 *
 * Three.js draws opaque primitives before every transparent primitive, even
 * when renderOrder says otherwise. All 2D fills and strokes therefore share
 * the transparent pass, with depth testing and writing disabled. Material
 * opacity still controls blending; an opaque stroke remains visually opaque.
 *
 * @post planarScenes.has(scene) => scene.children.every(root => root.children.every(child => child.renderOrder === root.renderOrder))
 */
export function prepareSceneComposition(scene: THREE.Scene): void {
  if (!planarScenes.has(scene)) return;
  for (const root of scene.children) {
    root.traverse((object) => {
      object.renderOrder = root.renderOrder;
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      for (const item of Array.isArray(material) ? material : [material]) {
        item.depthTest = false;
        item.depthWrite = false;
        if (!item.transparent) {
          item.transparent = true;
          item.needsUpdate = true;
        }
      }
    });
  }
}
