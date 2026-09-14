import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Scene } from './Scene';
import { ThreeDScene } from './ThreeDScene';
import { Circle } from '../mobjects/geometry/Circle';
import { Line } from '../mobjects/geometry/Line';
import { Create } from '../animation/creation/Create';
import { Torus } from '../mobjects/three-d/Torus';
import { prepareSceneComposition } from './SceneComposition';
import { Group } from './Group';

function materials(root: THREE.Object3D): THREE.Material[] {
  const result: THREE.Material[] = [];
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (material) result.push(...(Array.isArray(material) ? material : [material]));
  });
  return result;
}

describe('Scene composition', () => {
  // MIGRATION: every 2D drawable, including regenerated children and foreground
  // objects, shares the ordered pass throughout creation and opacity changes.
  it('keeps rebuilt rays and foreground markers above older transparent fills', () => {
    const scene = Scene.createHeadless({ autoRender: false });
    const fill = new Circle({ fillOpacity: 0.5 });
    const ray = new Line({ start: [-2, 0, 0], end: [2, 0, 0] });
    const marker = new Circle({ radius: 0.1, fillOpacity: 1 });
    scene.add(new Group(fill, marker), ray);
    scene.addForegroundMobject(marker);
    const animation = new Create(ray);
    animation.begin();

    for (const progress of [0, 0.5, 1, 0.5, 1]) {
      animation.interpolate(progress);
      marker.opacity = progress === 0.5 ? 0.5 : 1;
      scene.render();
      for (const object of [fill, ray, marker]) {
        const root = object.getThreeObject();
        root.traverse((child) => expect(child.renderOrder).toBe(root.renderOrder));
        for (const material of materials(root)) {
          expect(material.depthTest).toBe(false);
          expect(material.depthWrite).toBe(false);
          expect(material.transparent).toBe(true);
        }
      }
      expect(ray.getThreeObject().renderOrder).toBeGreaterThan(fill.getThreeObject().renderOrder);
      expect(marker.getThreeObject().renderOrder).toBeGreaterThan(ray.getThreeObject().renderOrder);
    }
    scene.dispose();
  });

  // MIGRATION: 2D/3D scene switching never changes opaque 3D depth writes,
  // transparency, or the depth-prepass materials required for self-occlusion.
  it('retains torus depth and transparent self-occlusion while switching scenes', () => {
    const planar = Scene.createHeadless({ autoRender: false });
    planar.add(new Circle({ fillOpacity: 0.5 }));
    const spatial = ThreeDScene.createHeadless({ autoRender: false, enableOrbitControls: false });
    const torus = new Torus();
    spatial.add(torus);

    for (const opacity of [1, 0.5, 1]) {
      planar.render();
      torus.opacity = opacity;
      torus.rotate(0.25, [1, 0, 0]);
      spatial.render();
      // Multi-camera rendering also passes through the composition policy.
      prepareSceneComposition(spatial.threeScene);
      const torusMaterials = materials(torus.getThreeObject());
      expect(torusMaterials.length).toBeGreaterThan(0);
      for (const material of torusMaterials) {
        expect(material.depthTest).toBe(true);
        expect(material.depthWrite).toBe(
          material.userData.depthPrepass ? true : !material.transparent,
        );
        if (material.colorWrite) expect(material.transparent).toBe(opacity < 1);
      }
    }
    planar.dispose();
    spatial.dispose();
  });
});
