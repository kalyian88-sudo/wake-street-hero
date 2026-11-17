/**
 * Official WHY NOT artwork (src/brand/img/*.png, rendered from the brand's EPS files; bundled by Vite):
 *   mark   — the red "?!" mark (helmets, jersey print, stickers)
 *   whynot — the stamped "WHY NOT" block logo (boards, banners, UI)
 *   bars   — crossed handles with the WHY NOT ribbon (decals, share card)
 * Loaded once at start-up (local files, cached offline by the service worker). Painters use them when
 * available and fall back to the procedural wordmark otherwise (headless tests, load failure).
 */
import barsUrl from './img/bars.png';
import markUrl from './img/mark.png';
import whynotUrl from './img/whynot.png';

export type BrandImageId = 'mark' | 'whynot' | 'bars';
const URLS: Record<BrandImageId, string> = { mark: markUrl, whynot: whynotUrl, bars: barsUrl };

const IDS: readonly BrandImageId[] = ['mark', 'whynot', 'bars'];
const images = new Map<BrandImageId, HTMLImageElement>();
let pending: Promise<void> | null = null;

export function brandImageUrl(id: BrandImageId): string {
  return URLS[id];
}

/** Start (or join) loading all brand images. Never rejects. */
export function preloadBrandImages(): Promise<void> {
  if (pending) return pending;
  if (typeof Image === 'undefined') return (pending = Promise.resolve());
  pending = Promise.all(
    IDS.map(
      (id) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => {
            images.set(id, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = brandImageUrl(id);
        }),
    ),
  ).then(() => undefined);
  return pending;
}

export function brandImage(id: BrandImageId): HTMLImageElement | null {
  return images.get(id) ?? null;
}

/** Draw a brand image into a canvas box (contain, centred), optionally recoloured to one flat colour. */
export function drawBrandImage(
  ctx: CanvasRenderingContext2D,
  id: BrandImageId,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
  opts: { tint?: string; rotate?: number; alpha?: number } = {},
): boolean {
  const img = brandImage(id);
  if (!img) return false;
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  let src: CanvasImageSource = img;
  if (opts.tint) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const x = c.getContext('2d');
    if (!x) return false;
    x.drawImage(img, 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = opts.tint;
    x.fillRect(0, 0, c.width, c.height);
    src = c;
  }
  ctx.save();
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.translate(cx, cy);
  if (opts.rotate) ctx.rotate(opts.rotate);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}
