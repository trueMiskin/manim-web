// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { GlyphVMobject } from '../mobjects/text/GlyphVMobject';
import { Tex } from '../mobjects/text/Tex';
import { buildEarcutFillGeometry } from './VMobjectGeometry';

describe('compound glyph fill', () => {
  afterEach(() => vi.unstubAllGlobals());
  // MIGRATION: opposite-winding contours preserve their empty counters regardless of contour order.
  it('leaves the inner-first Droid Sans o counter empty', async () => {
    const bytes = readFileSync(
      resolve(__dirname, '../../examples/presentations/tech-demo/assets/fonts/DroidSans-Bold.ttf'),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      })),
    );
    const title = new Tex({
      latex: '{{Differentiable}} {{Ray Tracing}} {{for}} {{Radio}} {{Propagation}} {{Modeling}}',
      fontUrl: '/fonts/DroidSans-Bold.ttf',
      fontSize: 36,
    });
    await title.waitForRender();
    const glyph = title.getPart(10).children[1] as GlyphVMobject;
    glyph.fillOpacity = 1;
    const lengths = glyph.getSubpathLengths()!;
    const points = glyph.getLocalPoints();
    expect(lengths).toEqual([37, 61]);
    const inner = points.slice(0, lengths[0]);
    const x = (Math.min(...inner.map((p) => p[0])) + Math.max(...inner.map((p) => p[0]))) / 2;
    const y = (Math.min(...inner.map((p) => p[1])) + Math.max(...inner.map((p) => p[1]))) / 2;
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    const ringX = (Math.max(...inner.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2;
    const ringRay = new THREE.Raycaster(
      new THREE.Vector3(ringX, y, 1),
      new THREE.Vector3(0, 0, -1),
    );
    const geometry = buildEarcutFillGeometry(points, [], () => lengths)!;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld(true);
    expect(ray.intersectObject(mesh)).toHaveLength(0);
    expect(ringRay.intersectObject(mesh).length).toBeGreaterThan(0);
    const object = glyph.getThreeObject();
    object.updateMatrixWorld(true);
    const fill = object.children.find(
      (child) => child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial,
    )!;
    expect(fill).toBeDefined();
    expect(ray.intersectObject(fill)).toHaveLength(0);
    expect(ringRay.intersectObject(fill).length).toBeGreaterThan(0);
    title.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
