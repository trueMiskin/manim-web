import * as THREE from 'three';

// Scene type is explicit: an orthographic camera can also render 3D geometry.
const planarScenes = new WeakSet<THREE.Scene>();
const explicitOrders = new WeakMap<THREE.Object3D, number>();

/** Preserve an authored foreground layer even when its object remains in a group. */
export function setExplicitRenderOrder(object: THREE.Object3D, order?: number): void {
  if (order === undefined) explicitOrders.delete(object);
  else explicitOrders.set(object, order);
}

export function getExplicitRenderOrder(object: THREE.Object3D): number | undefined {
  return explicitOrders.get(object);
}

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
 * Descendants inherit their parent layer unless explicitly assigned to the foreground.
 */
export function prepareSceneComposition(scene: THREE.Scene): void {
  if (!planarScenes.has(scene)) return;
  const visit = (object: THREE.Object3D, inheritedOrder: number): void => {
    object.renderOrder = explicitOrders.get(object) ?? inheritedOrder;
    const material = (object as THREE.Mesh).material;
    for (const item of material ? (Array.isArray(material) ? material : [material]) : []) {
      item.depthTest = false;
      item.depthWrite = false;
      if (!item.transparent) {
        item.transparent = true;
        item.needsUpdate = true;
      }
    }
    for (const child of object.children) visit(child, object.renderOrder);
  };
  for (const root of scene.children) visit(root, root.renderOrder);
}
