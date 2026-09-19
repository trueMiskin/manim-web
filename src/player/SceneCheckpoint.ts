import * as THREE from 'three';
import { Mobject, type UpdaterFunction } from '../core/Mobject';
import { Scene } from '../core/Scene';
import { Camera3D, type Camera2DAspectMode } from '../core/Camera';
import { serializeMobject, deserializeMobject, type MobjectState } from '../core/StateManager';
import { getExplicitRenderOrder, setExplicitRenderOrder } from '../core/SceneComposition';

interface ObjectCheckpoint {
  readonly object: Mobject;
  readonly state: MobjectState;
  readonly children: readonly Mobject[];
  readonly updaters: readonly UpdaterFunction[];
  readonly visible: boolean;
  readonly renderOrder: number;
  readonly explicitOrder?: number;
}

/** In-memory checkpoint: immutable data, retaining identities for updater closures. */
export interface SceneCheckpoint {
  readonly fixedInFrame?: readonly Mobject[];
  readonly members: readonly Mobject[];
  readonly objects: readonly ObjectCheckpoint[];
  readonly camera: THREE.OrthographicCamera;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly aspectMode: Camera2DAspectMode;
  readonly camera3D?: THREE.PerspectiveCamera;
  readonly lookAt?: THREE.Vector3;
}

function freezeData<T>(value: T): T {
  if (Object.isFrozen(value)) return value;
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

/** Share unchanged plain-data branches while keeping each captured value immutable. */
function shareData<T>(value: T, previous: unknown): T {
  if (Object.is(value, previous)) return value;
  if (value === null || typeof value !== 'object') return value;
  if (!canShare(value, previous)) return freezeData(value);
  const current = value as Record<string, unknown>;
  const old = previous as Record<string, unknown>;
  const keys = Object.keys(current);
  let identical =
    keys.length === Object.keys(old).length &&
    (!Array.isArray(value) || value.length === (previous as unknown[]).length);
  for (const key of keys) {
    current[key] = shareData(current[key], old[key]);
    if (!Object.prototype.hasOwnProperty.call(old, key) || !Object.is(current[key], old[key]))
      identical = false;
  }
  return identical ? (previous as T) : Object.freeze(value);
}

function canShare(value: object, previous: unknown): previous is object {
  const prototype = Object.getPrototypeOf(value);
  return (
    previous !== null &&
    typeof previous === 'object' &&
    Object.getPrototypeOf(previous) === prototype &&
    (Array.isArray(value) || prototype === Object.prototype || prototype === null)
  );
}

function perspective(scene: Scene): Camera3D | undefined {
  return (scene as Scene & { camera3D?: Camera3D }).camera3D;
}

function sameItems<T>(current: readonly T[], expected: readonly T[]): boolean {
  return (
    current.length === expected.length && current.every((item, index) => item === expected[index])
  );
}

/** Capture current membership and all known animated objects, including removed roots. */
export function captureScene(
  scene: Scene,
  known: Iterable<Mobject> = [],
  cache?: WeakMap<Mobject, MobjectState>,
): SceneCheckpoint {
  const objects = new Set<Mobject>();
  const visit = (mobject: Mobject) => {
    if (objects.has(mobject)) return;
    objects.add(mobject);
    mobject.children.forEach(visit);
  };
  [...scene.mobjects, ...known, scene.camera.frame].forEach(visit);
  const camera3D = perspective(scene);
  return Object.freeze({
    members: Object.freeze([...scene.mobjects]),
    fixedInFrame: (
      scene as Scene & { getFixedInFrameMobjects?: () => readonly Mobject[] }
    ).getFixedInFrameMobjects?.(),
    objects: Object.freeze(
      Array.from(objects, (object) => {
        const state = shareData(serializeMobject(object, false), cache?.get(object));
        cache?.set(object, state);
        return Object.freeze({
          object,
          state,
          children: Object.freeze([...object.children]),
          updaters: Object.freeze(object.getUpdaters()),
          visible: object.getThreeObject().visible,
          renderOrder: object.getThreeObject().renderOrder,
          explicitOrder: getExplicitRenderOrder(object.getThreeObject()),
        });
      }),
    ),
    camera: scene.camera.getCamera().clone(),
    frameWidth: scene.camera.authoredFrameWidth,
    frameHeight: scene.camera.authoredFrameHeight,
    aspectMode: scene.camera.aspectMode,
    camera3D: camera3D?.getCamera().clone(),
    lookAt: camera3D?.lookAtTarget,
  });
}

/** Restore identities, hierarchy, style, subclass state, updaters and camera atomically. */
export function restoreScene(scene: Scene, checkpoint: SceneCheckpoint, render = true): void {
  const restore = () => scene.batch(() => restoreContents(scene, checkpoint));
  if (render) restore();
  else scene._withDeferredRender(restore);
}

function restoreObjects(checkpoint: SceneCheckpoint): void {
  const changedParents = checkpoint.objects.filter(
    (entry) => !sameItems(entry.object.children, entry.children),
  );
  for (const entry of changedParents) {
    for (const child of [...entry.object.children]) entry.object.remove(child);
  }
  for (const entry of changedParents) {
    for (const child of entry.children) entry.object.add(child);
  }
  for (const entry of checkpoint.objects) {
    if (!sameItems(entry.object.getUpdaters(), entry.updaters)) {
      entry.object.clearUpdaters();
      entry.updaters.forEach((updater) => entry.object.addUpdater(updater));
    }
    deserializeMobject(entry.object, entry.state);
    const threeObject = entry.object._threeObject ?? entry.object.getThreeObject();
    threeObject.visible = entry.visible;
  }
}

function restoreContents(scene: Scene, checkpoint: SceneCheckpoint): void {
  const fixed =
    (
      scene as Scene & { getFixedInFrameMobjects?: () => readonly Mobject[] }
    ).getFixedInFrameMobjects?.() ?? [];
  const membershipChanged =
    !sameItems([...scene.mobjects], checkpoint.members) ||
    !sameItems(fixed, checkpoint.fixedInFrame ?? []);
  if (membershipChanged) scene.remove(...scene.mobjects);
  restoreObjects(checkpoint);
  if (membershipChanged && checkpoint.fixedInFrame) {
    (
      scene as Scene & { addFixedInFrameMobjects: (...objects: Mobject[]) => unknown }
    ).addFixedInFrameMobjects(...checkpoint.fixedInFrame);
  }
  if (membershipChanged) scene.add(...checkpoint.members);
  for (const entry of checkpoint.objects) {
    const threeObject = entry.object._threeObject ?? entry.object.getThreeObject();
    threeObject.renderOrder = entry.renderOrder;
    setExplicitRenderOrder(threeObject, entry.explicitOrder);
  }
  scene.camera.frameWidth = checkpoint.frameWidth;
  scene.camera.frameHeight = checkpoint.frameHeight;
  scene.camera.aspectMode = checkpoint.aspectMode;
  scene.camera.getCamera().copy(checkpoint.camera);
  const aspectRatio = scene.renderer.width / scene.renderer.height;
  scene.camera.setAspectRatio(aspectRatio);
  const camera3D = perspective(scene);
  if (camera3D && checkpoint.camera3D && checkpoint.lookAt) {
    camera3D.setFov(checkpoint.camera3D.fov);
    camera3D.setLookAt(checkpoint.lookAt.toArray());
    camera3D.getCamera().copy(checkpoint.camera3D);
    camera3D.setAspectRatio(aspectRatio);
  }
}
