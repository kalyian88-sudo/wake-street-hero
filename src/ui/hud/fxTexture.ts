/**
 * Small generated textures / probes for the HUD (built once at start-up, never per frame).
 */
import { seededRng } from '../../data/geometry';

/**
 * Radial speed-line texture for the slow-motion look: thin white streaks that start away from the
 * centre and run to the edges (so the rider stays clear). 256² PNG data URL, stretched over the screen.
 */
export function makeStreakTexture(): string {
  try {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    if (!g) return '';
    const rng = seededRng(1907);
    const c = size / 2;
    g.lineCap = 'round';
    for (let i = 0; i < 110; i++) {
      const a = rng() * Math.PI * 2;
      const r0 = size * (0.27 + rng() * 0.2);
      const r1 = size * 0.74;
      const x0 = c + Math.cos(a) * r0;
      const y0 = c + Math.sin(a) * r0;
      const x1 = c + Math.cos(a) * r1;
      const y1 = c + Math.sin(a) * r1;
      const alpha = 0.08 + rng() * 0.3;
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.4, `rgba(255,255,255,${(alpha * 0.6).toFixed(3)})`);
      grad.addColorStop(1, `rgba(255,255,255,${alpha.toFixed(3)})`);
      g.strokeStyle = grad;
      g.lineWidth = 0.5 + rng() * 1.5;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/**
 * True when none of the condensed display fonts of the HUD stack is installed (text renders as wide as
 * plain sans-serif). The HUD then squeezes its display text horizontally to keep the brand look.
 */
export function lacksCondensedFont(): boolean {
  try {
    const g = document.createElement('canvas').getContext('2d');
    if (!g) return false;
    const sample = 'WHY NOT 0123456789 ТРЮК';
    g.font = 'italic 800 40px "HelveticaNeue-CondensedBold","Helvetica Neue Condensed","Arial Narrow","Roboto Condensed","sans-serif-condensed",Impact,sans-serif';
    const display = g.measureText(sample).width;
    g.font = 'italic 800 40px sans-serif';
    const plain = g.measureText(sample).width;
    return plain > 0 && display > plain * 0.92;
  } catch {
    return false;
  }
}
