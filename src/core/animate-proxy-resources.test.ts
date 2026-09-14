// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Text } from '../mobjects/text/Text';
import { Group } from './Group';
import { AnimateProxy } from './AnimateProxy';
import { Animation } from '../animation/Animation';
import { Timeline } from '../animation/Timeline';
import { Transform } from '../animation/transform/Transform';
import { Player } from '../player/Player';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 10 }),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => vi.restoreAllMocks());

function texture(root: THREE.Object3D): THREE.Texture {
  let result: THREE.Texture | undefined;
  root.traverse((node) => {
    if (
      node instanceof THREE.Mesh &&
      node.material instanceof THREE.MeshBasicMaterial &&
      node.material.map
    )
      result = node.material.map;
  });
  if (!result) throw new Error('Expected a textured mesh');
  return result;
}

describe('animation-owned target resources', () => {
  // MIGRATION: checkpoint jumps release partial cross-fade siblings before
  // capture, and frozen capture reconstructs the exact interrupted frame.
  it('cleans up a partial text proxy before endpoint seeks and checkpoint capture', async () => {
    const p = new Player(document.createElement('div'), {
      headless: true,
      ui: false,
      keyboard: false,
      pointer: false,
    });
    const text = new Text({ text: 'Checkpoint text' });
    await p.sequence(async (scene) => {
      scene.add(text);
      await scene.step({ id: 'move' }, () => scene.play(text.animate.shift([2, 0, 0])));
      await scene.step({ id: 'move-again' }, () => scene.play(text.animate.shift([2, 0, 0])));
    });
    const host = p.scene.threeScene;
    p.seek(0.4);
    expect(host.children).toHaveLength(2);
    p.seekCheckpoint('move');
    expect(host.children).toEqual([text.getThreeObject()]);
    expect(text.getCenter()[0]).toBeCloseTo(2);
    p.seek(0.4);
    p.seek(1.4);
    expect(host.children).toHaveLength(2);
    p.seek(0.4);
    const partialPosition = text.getCenter();
    const partialTime = p.timeline.getCurrentTime();
    const canvas = document.createElement('canvas');
    const capture = vi.spyOn(canvas, 'toDataURL').mockImplementation(() => {
      expect(host.children).toEqual([text.getThreeObject()]);
      expect(text.getThreeObject().visible).toBe(false);
      expect(text.getCenter()[0]).toBeCloseTo(4);
      return 'data:image/png;base64,capture';
    });
    vi.spyOn(p.scene.renderer, 'getCanvas').mockReturnValue(canvas);
    const snapshot = await p.captureCheckpoint('move-again');
    expect(capture).toHaveBeenCalledOnce();
    expect(snapshot.text.map((run) => run.text)).toEqual(['Checkpoint text']);
    expect(p.timeline.getCurrentTime()).toBe(partialTime);
    expect(text.getCenter()).toEqual(partialPosition);
    expect(host.children).toHaveLength(2);
    expect(text.getThreeObject().visible).toBe(true);
    p.dispose();
  });

  // MIGRATION: repeated partial proxy replay retains one live target at most,
  // and reset/finish/terminal disposal release only temporary texture resources.
  it('removes and disposes partial Text cross-fades without orphan siblings', () => {
    const text = new Text({ text: 'Animated text' });
    const host = new THREE.Group();
    host.add(text.getThreeObject());
    const proxy = new AnimateProxy(text).shift([2, 0, 0]);
    const sourceMaterial = text.getDisplayMeshes()[0].material as THREE.Material;
    const sourceMaterialDisposed = vi.fn();
    sourceMaterial.addEventListener('dispose', sourceMaterialDisposed);
    const disposals: ReturnType<typeof vi.fn>[] = [];
    for (let pass = 0; pass < 4; pass++) {
      Animation.withExternalState([proxy], () => {
        proxy.begin();
        proxy.interpolate(0.4);
        expect(host.children).toHaveLength(2);
        const targetTexture = texture(host.children[1]);
        const targetMaterial = (host.children[1].children[0] as THREE.Mesh)
          .material as THREE.Material;
        const materialDisposed = vi.fn();
        targetMaterial.addEventListener('dispose', materialDisposed);
        const dispose = vi.fn();
        disposals.push(dispose);
        targetTexture.addEventListener('dispose', dispose);
        if (pass === 3) proxy.finish();
        else proxy.reset();
        expect(host.children).toEqual([text.getThreeObject()]);
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(materialDisposed).toHaveBeenCalled();
        expect(sourceMaterialDisposed).not.toHaveBeenCalled();
        expect(texture(text.getThreeObject())).not.toBe(targetTexture);
      });
    }
    expect(text.getCenter()[0]).toBeCloseTo(2);
    const timeline = new Timeline();
    timeline.add(proxy);
    Animation.withExternalState([proxy], () => proxy.begin());
    expect(host.children).toHaveLength(2);
    const lastDisposed = vi.fn();
    texture(host.children[1]).addEventListener('dispose', lastDisposed);
    timeline.clear();
    expect(host.children).toEqual([text.getThreeObject()]);
    expect(lastDisposed).toHaveBeenCalledTimes(1);
    timeline.add(proxy);
    proxy.reset();
    proxy.begin();
    proxy.finish();
    expect(text.getCenter()[0]).toBeCloseTo(4);
    expect(sourceMaterialDisposed).not.toHaveBeenCalled();
    timeline.clear();
    expect(disposals.every((disposed) => disposed.mock.calls.length === 1)).toBe(true);
  });

  // MIGRATION: disposing an animation releases its own snapshots, never a caller's
  // Transform target, and grouped proxy completion restores source descendants.
  it('preserves user targets and live grouped text when proxy targets are released', () => {
    const text = new Text({ text: 'Grouped text' });
    const group = new Group(text);
    const host = new THREE.Group();
    host.add(group.getThreeObject());
    const proxy = new AnimateProxy(group).shift([2, 0, 0]);
    proxy.begin();
    proxy.finish();
    expect(host.children).toEqual([group.getThreeObject()]);
    expect(text.opacity).toBe(1);
    expect(group.getCenter()[0]).toBeCloseTo(2);
    proxy.dispose();
    const target = new Text({ text: 'User target' });
    const animation = new Transform(text, target);
    animation.begin();
    const disposed = vi.fn();
    texture(target.getThreeObject()).addEventListener('dispose', disposed);
    animation.interpolate(0.4);
    animation.reset();
    expect(target.getThreeObject().parent).toBeNull();
    animation.dispose();
    expect(disposed).not.toHaveBeenCalled();
    const targetOwner = new THREE.Group();
    targetOwner.add(target.getThreeObject());
    for (const end of ['reset', 'finish', 'dispose'] as const) {
      const attached = new Transform(text, target);
      attached.begin();
      attached.interpolate(0.4);
      attached[end]();
      expect(target.getThreeObject().parent).toBe(targetOwner);
      expect(disposed).not.toHaveBeenCalled();
      attached.dispose();
    }
    const fallbackTarget = new Group(new Text({ text: 'Fallback target' }));
    const fallback = new Transform(group, fallbackTarget);
    fallback.begin();
    fallback.interpolate(0.4);
    expect(fallbackTarget.getThreeObject().parent).toBe(host);
    fallback.reset();
    expect(fallbackTarget.getThreeObject().parent).toBeNull();
    fallback.dispose();
  });
});
