import type { IBackdropScene, MenuBackdrop, WorldBuildContext } from '../../types';

/**
 * Create the 3D scene for a menu backdrop, or null when the backdrop needs no 3D.
 * (The title screen draws its own living key art — src/ui/keyart — so no menu needs a 3D scene now.)
 */
export function createBackdrop(_b: MenuBackdrop, _ctx: WorldBuildContext): IBackdropScene | null {
  return null;
}
