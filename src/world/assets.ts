// STUB — replaced by the world agent. Keep the export name/signature.
import type { Object3D } from 'three';

/**
 * GLB override hook. Returns a model from /public/assets when `assets/manifest.json` maps `key`
 * to a .glb file, otherwise null (→ the procedural model is used).
 * Keys: 'rider', 'board.wakeboard', 'board.wakeskate', 'winch', 'prop:<type>' …
 */
export async function loadAssetOverride(_key: string): Promise<Object3D | null> {
  return null;
}
