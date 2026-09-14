import * as THREE from 'three';
import { Mobject, type UpdaterFunction } from '../core/Mobject';
import { Scene } from '../core/Scene';
import { Camera3D } from '../core/Camera';
import { serializeMobject, deserializeMobject, type MobjectState } from '../core/StateManager';

interface ObjectCheckpoint {
  readonly object: Mobject;
  readonly state: MobjectState;
  readonly children: readonly Mobject[];
  readonly updaters: readonly UpdaterFunction[];
  readonly visible: boolean;
}

/** In-memory checkpoint: immutable data, retaining identities for updater closures. */
export interface SceneCheckpoint {
  readonly fixedInFrame?: readonly Mobject[];
  readonly members: readonly Mobject[];
  readonly objects: readonly ObjectCheckpoint[];
  readonly camera: THREE.OrthographicCamera;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly camera3D?: THREE.PerspectiveCamera;
  readonly lookAt?: THREE.Vector3;
}

function freezeData<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

function perspective(scene: Scene): Camera3D | undefined {
  return (scene as Scene & { camera3D?: Camera3D }).camera3D;
}

/** Capture current membership and all known animated objects, including removed roots. */
export function captureScene(scene: Scene, known: Iterable<Mobject> = []): SceneCheckpoint {
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
      Array.from(objects, (object) =>
        Object.freeze({
          object,
          state: freezeData({ ...serializeMobject(object), children: [] }),
          children: Object.freeze([...object.children]),
          updaters: Object.freeze(object.getUpdaters()),
          visible: object.getThreeObject().visible,
        }),
      ),
    ),
    camera: scene.camera.getCamera().clone(),
    frameWidth: scene.camera.frameWidth,
    frameHeight: scene.camera.frameHeight,
    camera3D: camera3D?.getCamera().clone(),
    lookAt: camera3D?.lookAtTarget,
  });
}

/** Restore identities, hierarchy, style, subclass state, updaters and camera atomically. */
export function restoreScene(scene: Scene, checkpoint: SceneCheckpoint): void {
  scene.batch(() => {
    scene.remove(...scene.mobjects);
    for (const entry of checkpoint.objects) {
      entry.object.remove(...entry.object.children);
    }
    for (const entry of checkpoint.objects) {
      entry.object.add(...entry.children);
      entry.object.clearUpdaters();
      entry.updaters.forEach((updater) => entry.object.addUpdater(updater));
      deserializeMobject(entry.object, entry.state);
      entry.object.getThreeObject().visible = entry.visible;
    }
    if (checkpoint.fixedInFrame) {
      (
        scene as Scene & { addFixedInFrameMobjects: (...objects: Mobject[]) => unknown }
      ).addFixedInFrameMobjects(...checkpoint.fixedInFrame);
    }
    scene.add(...checkpoint.members);
    scene.camera.frameWidth = checkpoint.frameWidth;
    scene.camera.frameHeight = checkpoint.frameHeight;
    scene.camera.getCamera().copy(checkpoint.camera);
    const camera3D = perspective(scene);
    if (camera3D && checkpoint.camera3D && checkpoint.lookAt) {
      camera3D.setFov(checkpoint.camera3D.fov);
      camera3D.setLookAt(checkpoint.lookAt.toArray());
      camera3D.getCamera().copy(checkpoint.camera3D);
    }
  });
}
