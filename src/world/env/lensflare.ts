/**
 * Sun lens flare (day / golden / sunset spots): the glare and ghost discs an action camera gets when it
 * looks towards the sun. three/examples Lensflare does the occlusion test itself (houses hide it).
 * Flare sprites are drawn on small canvases — no image files.
 */
import { CanvasTexture, Color } from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import type { EnvDef } from '../../types';

function radial(size: number, stops: [number, string][]): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [t, col] of stops) g.addColorStop(t, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(c);
}

function ring(size: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(c);
}

/** null for night / overcast spots. */
export function createSunFlare(def: EnvDef): Lensflare | null {
  if (def.timeOfDay === 'night' || def.timeOfDay === 'overcast') return null;
  const flare = new Lensflare();
  const sun = new Color(def.sunColor);
  const glow = radial(256, [
    [0, 'rgba(255,255,255,1)'],
    [0.08, 'rgba(255,250,230,0.9)'],
    [0.3, 'rgba(255,220,170,0.25)'],
    [1, 'rgba(255,200,150,0)'],
  ]);
  const ghost = radial(64, [
    [0, 'rgba(255,255,255,0.55)'],
    [0.7, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  const halo = ring(128);
  flare.addElement(new LensflareElement(glow, 420, 0, sun));
  flare.addElement(new LensflareElement(halo, 260, 0.0, new Color(1, 0.9, 0.75)));
  flare.addElement(new LensflareElement(ghost, 50, 0.45, new Color(0.6, 0.9, 1)));
  flare.addElement(new LensflareElement(ghost, 90, 0.62, new Color(1, 0.75, 0.45)));
  flare.addElement(new LensflareElement(ghost, 36, 0.8, new Color(0.8, 1, 0.7)));
  flare.addElement(new LensflareElement(halo, 140, 1.0, new Color(1, 0.6, 0.5)));
  flare.frustumCulled = false;
  return flare;
}
