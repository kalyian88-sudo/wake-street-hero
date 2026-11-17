import type { IBackdropScene, MenuBackdrop, WorldBuildContext } from '../../types';
import { createSplashBackdrop } from './splash';

/** Create the 3D scene for a menu backdrop, or null when the backdrop needs no 3D. */
export function createBackdrop(b: MenuBackdrop, ctx: WorldBuildContext): IBackdropScene | null {
  if (b.kind === 'splash') return createSplashBackdrop(ctx);
  return null;
}
