/**
 * GLB override hook. Returns a model from /public/assets when `assets/manifest.json` maps `key`
 * to a .glb file, otherwise null (→ the procedural model is used).
 * Keys: 'rider', 'board.wakeboard', 'board.wakeskate', 'winch', 'prop:<type>' …
 *
 * The manifest is fetched once; the GLTF loader is only imported when a key is actually mapped,
 * so the default build never pays for it.
 */
import type { Object3D } from 'three';

let manifest: Promise<Record<string, string>> | null = null;
const cache = new Map<string, Promise<Object3D | null>>();

function assetUrl(file: string): string {
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
  return new URL(`assets/${file}`, base).toString();
}

function loadManifest(): Promise<Record<string, string>> {
  if (!manifest) {
    manifest = (async () => {
      try {
        if (typeof fetch === 'undefined' || typeof document === 'undefined') return {};
        const res = await fetch(assetUrl('manifest.json'), { cache: 'no-cache' });
        if (!res.ok) return {};
        const json: unknown = await res.json();
        if (!json || typeof json !== 'object') return {};
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(json as Record<string, unknown>)) if (typeof v === 'string' && v) out[k] = v;
        return out;
      } catch {
        return {};
      }
    })();
  }
  return manifest;
}

export async function loadAssetOverride(key: string): Promise<Object3D | null> {
  const map = await loadManifest();
  const file = map[key];
  if (!file) return null;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().loadAsync(assetUrl(file));
        gltf.scene.traverse((o) => {
          o.castShadow = true;
          o.receiveShadow = true;
        });
        return gltf.scene as Object3D;
      } catch (err) {
        console.warn(`[assets] override "${key}" → ${file} failed to load, using the procedural model`, err);
        return null;
      }
    })();
    cache.set(key, p);
  }
  const model = await p;
  return model ? model.clone(true) : null;
}

/** True when the manifest maps at least one key with this prefix (lets callers skip per-prop lookups). */
export async function hasAssetOverrides(prefix: string): Promise<boolean> {
  const map = await loadManifest();
  for (const k of Object.keys(map)) if (k.startsWith(prefix)) return true;
  return false;
}
