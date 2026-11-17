/**
 * Body atlas painter: face, base torso layer, impact vest, shorts legs, boot cuff, helmet / cap and
 * the flat swatches — one 1024² colour canvas + a quarter-size roughness canvas with the same layout.
 */
import { drawBrandImage } from '../brand/images';
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace, type Texture } from 'three';
import { BRAND } from '../config';
import { ATLAS, SWATCH_ROUGHNESS, type AtlasRect, type Outfit } from './rigDef';
import { brandWords, contrast, css, drawWordmark, luma, mix, paintGraphic, rgba, roundRect, shade, softShade, type Ctx } from './paint';

export interface BodyAtlas {
  map: Texture;
  rough: Texture;
}

interface CacheEntry {
  atlas: BodyAtlas;
  refs: number;
}
const cache = new Map<string, CacheEntry>();

export function acquireBodyAtlas(key: string, outfit: Outfit, anisotropy: number): BodyAtlas {
  let e = cache.get(key);
  if (!e) {
    e = { atlas: paintBodyAtlas(outfit, anisotropy), refs: 0 };
    cache.set(key, e);
  }
  e.refs++;
  return e.atlas;
}

export function releaseBodyAtlas(key: string): void {
  const e = cache.get(key);
  if (!e) return;
  if (--e.refs <= 0) {
    e.atlas.map.dispose();
    e.atlas.rough.dispose();
    cache.delete(key);
  }
}

function grey(v: number): string {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${g},${g},${g})`;
}

function paintBodyAtlas(o: Outfit, anisotropy: number): BodyAtlas {
  const S = ATLAS.size;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d') as Ctx;
  const rc = document.createElement('canvas');
  rc.width = rc.height = S / 4;
  const rctx = rc.getContext('2d') as Ctx;
  rctx.scale(0.25, 0.25);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  rctx.fillStyle = grey(0.8);
  rctx.fillRect(0, 0, S, S);

  region(ctx, rctx, ATLAS.face, () => paintFace(ctx, rctx, o));
  region(ctx, rctx, ATLAS.torso, () => paintTorso(ctx, rctx, o));
  region(ctx, rctx, ATLAS.vest, () => paintVest(ctx, rctx, o));
  region(ctx, rctx, ATLAS.legs, () => paintLegs(ctx, rctx, o));
  region(ctx, rctx, ATLAS.boot, () => paintBoot(ctx, rctx, o));
  region(ctx, rctx, ATLAS.headwear, () => paintHeadwear(ctx, rctx, o));

  // swatches: white in colour, stepped roughness
  const sw = ATLAS.swatches;
  for (let k = 0; k < SWATCH_ROUGHNESS.length; k++) {
    rctx.fillStyle = grey(SWATCH_ROUGHNESS[k]);
    rctx.fillRect(sw[0] + k * 64, sw[1], 64, 64);
  }

  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = anisotropy;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  const rough = new CanvasTexture(rc);
  rough.colorSpace = NoColorSpace;
  return { map, rough };
}

/** Run a painter with the origin at the rect's corner and drawing clipped to it (both canvases). */
function region(ctx: Ctx, rctx: Ctx, r: AtlasRect, fn: () => void): void {
  for (const c of [ctx, rctx]) {
    c.save();
    c.translate(r[0], r[1]);
    c.beginPath();
    c.rect(0, 0, r[2], r[3]);
    c.clip();
  }
  fn();
  ctx.restore();
  rctx.restore();
}

// ───────────────────────────────────────────────────────────────── Face ──

/**
 * Face region (512²). The head maps its front hemisphere orthographically around the centre
 * (220 px per unit of direction), the back of the head is squeezed into the rim — see faceUV().
 */
function paintFace(ctx: Ctx, rctx: Ctx, o: Outfit): void {
  const skin = o.skin;
  const dark = luma(skin) < 0.42;
  ctx.fillStyle = css(skin);
  ctx.fillRect(0, 0, 512, 512);
  rctx.fillStyle = grey(0.55);
  rctx.fillRect(0, 0, 512, 512);
  const cx = 256;

  // soft modelling: warm cheeks, lighter brow / nose bridge, darker under the jaw
  const blush = ctx.createRadialGradient(0, 0, 0, 0, 0, 62);
  blush.addColorStop(0, rgba(mix(skin, 0xd8473a, 0.55), o.female ? 0.4 : 0.26));
  blush.addColorStop(1, rgba(mix(skin, 0xd8473a, 0.55), 0));
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + s * 104, 312);
    ctx.scale(1.2, 0.85);
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const jaw = ctx.createLinearGradient(0, 380, 0, 480);
  jaw.addColorStop(0, rgba(shade(skin, -0.5), 0));
  jaw.addColorStop(1, rgba(shade(skin, -0.5), 0.28));
  ctx.fillStyle = jaw;
  ctx.fillRect(0, 380, 512, 132);
  if (!o.female) {
    // faint stubble shadow
    const st = ctx.createRadialGradient(cx, 392, 30, cx, 392, 150);
    st.addColorStop(0, rgba(shade(mix(skin, o.hairColor, 0.5), -0.3), 0.14));
    st.addColorStop(1, rgba(shade(skin, -0.3), 0));
    ctx.fillStyle = st;
    ctx.fillRect(100, 300, 312, 200);
  }

  const eyeY = 236;
  const eyeDX = 78;
  const brow = shade(mix(o.hairColor, 0x20140e, 0.45), -0.15);
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    // socket shade
    const sock = ctx.createRadialGradient(ex, eyeY - 4, 4, ex, eyeY - 4, 46);
    sock.addColorStop(0, rgba(shade(skin, -0.45), 0.2));
    sock.addColorStop(1, rgba(shade(skin, -0.45), 0));
    ctx.fillStyle = sock;
    ctx.fillRect(ex - 50, eyeY - 50, 100, 100);
    // eye white (almond)
    ctx.save();
    ctx.translate(ex, eyeY);
    ctx.scale(1.16, 1.2);
    ctx.beginPath();
    ctx.moveTo(-27, 2);
    ctx.quadraticCurveTo(-4 * s, -21, 27, 0);
    ctx.quadraticCurveTo(2 * s, 17, -27, 2);
    ctx.closePath();
    ctx.fillStyle = '#f4f1ea';
    ctx.fill();
    ctx.save();
    ctx.clip();
    // iris + pupil, looking slightly ahead
    const ix = s * -1.5;
    ctx.fillStyle = dark ? '#3a2416' : '#5a3b24';
    ctx.beginPath();
    ctx.arc(ix, -1, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#120c08';
    ctx.beginPath();
    ctx.arc(ix, -1, 6.5, 0, Math.PI * 2);
    ctx.fill();
    // lid shadow
    ctx.fillStyle = 'rgba(40,24,16,0.28)';
    ctx.fillRect(-30, -22, 60, 11);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ix - 4.5, -5.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // upper lash line / lower lid
    ctx.lineCap = 'round';
    ctx.strokeStyle = o.female ? '#17100c' : rgba(0x2a1a12, 0.9);
    ctx.lineWidth = o.female ? 5.5 : 3.6;
    ctx.beginPath();
    ctx.moveTo(-28, 2.5);
    ctx.quadraticCurveTo(-4 * s, -22, 28, -0.5);
    ctx.stroke();
    if (o.female) {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(s * 26, -1);
      ctx.lineTo(s * 36, -9);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(shade(skin, -0.45), 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, 6);
    ctx.quadraticCurveTo(2 * s, 17, 24, 3);
    ctx.stroke();
    ctx.restore();
    // glossy eyes in the roughness map
    rctx.fillStyle = grey(0.12);
    rctx.beginPath();
    rctx.ellipse(ex, eyeY, 24, 13, 0, 0, Math.PI * 2);
    rctx.fill();
    // eyebrow: tapered stroke, slightly raised outside
    ctx.strokeStyle = css(brow);
    ctx.lineCap = 'round';
    ctx.lineWidth = o.female ? 7 : 12;
    ctx.beginPath();
    ctx.moveTo(ex - s * 32, eyeY - 40);
    ctx.quadraticCurveTo(ex + s * 2, eyeY - (o.female ? 58 : 54), ex + s * 40, eyeY - 43);
    ctx.stroke();
  }

  // nose: the bump is geometry — add nostril shade and a bridge highlight
  ctx.fillStyle = rgba(shade(skin, -0.5), 0.3);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * 11, 322, 6, 3.6, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const hl = ctx.createLinearGradient(cx - 10, 0, cx + 10, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0.13)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(cx - 10, 232, 20, 74);

  // mouth: relaxed confident smile
  const my = 372;
  const lip = o.female ? mix(skin, 0xb8323a, 0.62) : mix(skin, 0x8c3b33, 0.42);
  ctx.lineCap = 'round';
  if (o.female) {
    ctx.fillStyle = css(lip);
    ctx.beginPath();
    ctx.moveTo(cx - 34, my - 2);
    ctx.quadraticCurveTo(cx - 12, my - 13, cx, my - 7);
    ctx.quadraticCurveTo(cx + 12, my - 13, cx + 34, my - 2);
    ctx.quadraticCurveTo(cx, my + 22, cx - 34, my - 2);
    ctx.fill();
  } else {
    ctx.fillStyle = rgba(lip, 0.75);
    ctx.beginPath();
    ctx.moveTo(cx - 30, my - 1);
    ctx.quadraticCurveTo(cx, my - 9, cx + 30, my - 1);
    ctx.quadraticCurveTo(cx, my + 16, cx - 30, my - 1);
    ctx.fill();
  }
  ctx.strokeStyle = css(shade(lip, -0.55));
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(cx - 37, my - 5);
  ctx.quadraticCurveTo(cx, my + 9, cx + 37, my - 5);
  ctx.stroke();
  ctx.strokeStyle = rgba(shade(skin, -0.5), 0.35);
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + s * 41, my - 5, 5, s > 0 ? -1.2 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 1.2);
    ctx.stroke();
  }
  // chin highlight
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.ellipse(cx, 428, 30, 14, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ──────────────────────────────────────────────────────────────── Torso ──

/**
 * Base torso wrap (512²): u = right side (0) → front centre (128) → left side (256) → back centre (384);
 * v = crotch (bottom) → neck (top), linear in body height. Paints the tee / hoodie / wetsuit top and
 * the seat of the shorts.
 */
function paintTorso(ctx: Ctx, rctx: Ctx, o: Outfit): void {
  const [w1, w2] = brandWords();
  const wet = o.bottom === 'wetsuit';
  const hoodie = o.top === 'hoodie';
  const jersey = o.top === 'jersey';
  const bottom = o.bottomLook;
  const top = hoodie || jersey || !wet ? o.topLook : bottom;
  const hemY = hoodie ? 420 : jersey ? 412 : wet ? 512 : 392; // where the top garment ends (px from the top)

  // bottoms (shorts seat / wetsuit)
  ctx.fillStyle = css(bottom.primary);
  ctx.fillRect(0, 0, 512, 512);
  rctx.fillStyle = grey(wet ? 0.66 : 0.86);
  rctx.fillRect(0, 0, 512, 512);
  if (!wet) {
    paintGraphic(ctx, 0, 340, 512, 172, { ...bottom, graphic: bottom.graphic === 'logo' ? 'plain' : bottom.graphic }, 3);
    ctx.fillStyle = css(shade(bottom.primary, -0.35));
    ctx.fillRect(0, 352, 512, 16);
    // side stripes run down into the legs
    ctx.fillStyle = css(contrast(bottom.primary, bottom.accent));
    ctx.fillRect(-7, 368, 14, 144);
    ctx.fillRect(505, 368, 14, 144);
    ctx.fillRect(249, 368, 14, 144);
    // fly + drawstring
    ctx.strokeStyle = rgba(0x000000, 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(128, 368);
    ctx.lineTo(128, 470);
    ctx.stroke();
    ctx.strokeStyle = '#f2f2f2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(124, 366);
    ctx.lineTo(116, 398);
    ctx.moveTo(132, 366);
    ctx.lineTo(141, 394);
    ctx.stroke();
  }

  if (wet && !hoodie && !jersey) {
    // full suit: side panels, knee-to-chest piping, chest logo, back zip
    const second = contrast(bottom.primary, bottom.secondary);
    ctx.fillStyle = css(second);
    for (const x of [0, 256, 512]) {
      ctx.beginPath();
      ctx.moveTo(x - 34, 512);
      ctx.quadraticCurveTo(x - 46, 250, x - 20, 70);
      ctx.lineTo(x + 20, 70);
      ctx.quadraticCurveTo(x + 46, 250, x + 34, 512);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = css(contrast(bottom.primary, bottom.accent));
    ctx.lineWidth = 4;
    for (const x of [0, 256, 512]) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + s * 36, 512);
        ctx.quadraticCurveTo(x + s * 48, 250, x + s * 22, 70);
        ctx.stroke();
      }
    }
    // shoulder yoke
    ctx.fillStyle = css(second);
    ctx.fillRect(0, 0, 512, 46);
    drawWordmark(ctx, BRAND.name, 128, 150, 22, css(contrast(bottom.primary, bottom.accent)));
    drawWordmark(ctx, w1, 384, 130, 40, css(contrast(bottom.primary, bottom.accent)));
    drawWordmark(ctx, w2, 388, 182, 40, css(contrast(bottom.primary, bottom.accent)));
    ctx.strokeStyle = rgba(0x000000, 0.55);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(384, 34);
    ctx.lineTo(384, 96);
    ctx.stroke();
  } else {
    // tee / hoodie over the bottoms
    ctx.fillStyle = css(top.primary);
    ctx.fillRect(0, 0, 512, hemY);
    rctx.fillStyle = grey(hoodie ? 0.93 : 0.82);
    rctx.fillRect(0, 0, 512, hemY);
    paintGraphic(ctx, 0, 60, 512, hemY - 60, { ...top, graphic: top.graphic === 'logo' ? 'plain' : top.graphic }, 5);
    const ink = css(contrast(top.primary, top.accent));
    if (top.graphic === 'mark') {
      // WHY NOT "?!" print: big on the back, small on the chest, in the jersey's ink colour
      drawBrandImage(ctx, 'mark', 384, hemY * 0.48, 190, 250, { tint: css(top.secondary), alpha: 0.92 });
      drawBrandImage(ctx, 'mark', 152, hemY * 0.3, 54, 76, { tint: css(top.secondary), alpha: 0.92 });
    }
    if (hoodie) {
      // rib hem, kangaroo pocket, drawstrings, big chest + back print
      ctx.fillStyle = css(shade(top.primary, -0.22));
      ctx.fillRect(0, hemY - 26, 512, 26);
      ctx.strokeStyle = rgba(0x000000, 0.22);
      ctx.lineWidth = 1.5;
      for (let x = 4; x < 512; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, hemY - 26);
        ctx.lineTo(x, hemY);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(0x000000, 0.32);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(72, hemY - 28);
      ctx.lineTo(88, hemY - 108);
      ctx.lineTo(168, hemY - 108);
      ctx.lineTo(184, hemY - 28);
      ctx.stroke();
      ctx.strokeStyle = '#ececec';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(116, 40);
      ctx.lineTo(112, 118);
      ctx.moveTo(140, 40);
      ctx.lineTo(145, 110);
      ctx.stroke();
      drawWordmark(ctx, BRAND.name, 128, 200, 30, ink);
      drawWordmark(ctx, w1, 380, 150, 64, ink);
      drawWordmark(ctx, w2, 388, 232, 64, ink);
    } else {
      // tee hem line, collar, chest hit + back print
      ctx.fillStyle = rgba(0x000000, 0.2);
      ctx.fillRect(0, hemY - 5, 512, 5);
      ctx.fillStyle = css(shade(top.primary, luma(top.primary) > 0.5 ? -0.14 : 0.16));
      ctx.fillRect(0, 0, 512, 16);
      if (top.graphic !== 'mark') {
        drawWordmark(ctx, BRAND.name, 178, 150, 17, ink);
        drawWordmark(ctx, w1, 380, 150, 52, ink);
        drawWordmark(ctx, w2, 387, 216, 52, ink);
        ctx.fillStyle = css(BRAND.colors.red);
        if (top.primary !== BRAND.colors.red) ctx.fillRect(338, 256, 96, 6);
      } else {
        // small WHY NOT under the ?! on the back
        drawWordmark(ctx, BRAND.name, 384, hemY * 0.48 + 150, 22, css(top.secondary));
      }
    }
  }
  // fake AO: under the arms and into the crotch
  for (const x of [0, 256, 512]) {
    const g = ctx.createRadialGradient(x, 150, 6, x, 150, 90);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 90, 40, 180, 220);
  }
  const cg = ctx.createLinearGradient(0, 440, 0, 512);
  cg.addColorStop(0, 'rgba(0,0,0,0)');
  cg.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, 440, 512, 72);
}

// ───────────────────────────────────────────────────────────────── Vest ──

/** Impact vest wrap (512²): same u layout as the torso; v = hem (bottom) → shoulders (top). */
function paintVest(ctx: Ctx, rctx: Ctx, o: Outfit): void {
  const look = o.vest;
  if (!look) return;
  const [w1, w2] = brandWords();
  const ink = contrast(look.primary, look.accent);
  ctx.fillStyle = css(look.primary);
  ctx.fillRect(0, 0, 512, 512);
  rctx.fillStyle = grey(0.74);
  rctx.fillRect(0, 0, 512, 512);
  paintGraphic(ctx, 0, 0, 512, 512, { ...look, graphic: look.graphic === 'logo' || look.graphic === 'wood' ? 'plain' : look.graphic }, 11);

  // stretch side panels under the arms
  const side = contrast(look.primary, look.secondary);
  ctx.fillStyle = css(side);
  for (const x of [0, 256, 512]) {
    ctx.beginPath();
    ctx.moveTo(x - 40, 512);
    ctx.quadraticCurveTo(x - 50, 300, x - 62, 150);
    ctx.lineTo(x + 62, 150);
    ctx.quadraticCurveTo(x + 50, 300, x + 40, 512);
    ctx.closePath();
    ctx.fill();
  }
  rctx.fillStyle = grey(0.62);
  for (const x of [0, 256, 512]) rctx.fillRect(x - 44, 150, 88, 362);

  // segmented foam panels: stitch lines with a lit edge below, soft bulge shading per panel
  const rows = [118, 214, 312, 410];
  const panel = (x0: number, x1: number): void => {
    let prev = 22;
    for (const y of [...rows, 500]) {
      const g = ctx.createLinearGradient(0, prev, 0, y);
      g.addColorStop(0, 'rgba(255,255,255,0.13)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, prev, x1 - x0, y - prev);
      prev = y;
    }
    ctx.lineWidth = 3;
    for (const y of rows) {
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.moveTo(x0, y + 3);
      ctx.lineTo(x1, y + 3);
      ctx.stroke();
    }
  };
  panel(64, 126);
  panel(130, 194);
  panel(318, 450);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  for (const x of [64, 194, 318, 450]) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, 500);
    ctx.stroke();
  }

  // front zip with teeth and a pull
  ctx.fillStyle = '#0d0e10';
  ctx.fillRect(123, 0, 10, 512);
  ctx.fillStyle = '#9da3ab';
  for (let y = 4; y < 512; y += 7) ctx.fillRect(125, y, 6, 3);
  ctx.fillStyle = css(ink);
  roundRect(ctx, 121, 44, 14, 34, 5);
  ctx.fill();
  rctx.fillStyle = grey(0.35);
  rctx.fillRect(121, 0, 14, 512);

  // accent piping around the arm holes + hem binding
  ctx.strokeStyle = css(ink);
  ctx.lineWidth = 5;
  for (const x of [0, 256, 512]) {
    ctx.beginPath();
    ctx.moveTo(x - 66, 0);
    ctx.quadraticCurveTo(x - 70, 120, x - 62, 150);
    ctx.lineTo(x + 62, 150);
    ctx.quadraticCurveTo(x + 70, 120, x + 66, 0);
    ctx.stroke();
  }
  ctx.fillStyle = css(shade(side, luma(side) > 0.4 ? -0.3 : 0.12));
  ctx.fillRect(0, 498, 512, 14);

  // chest hit + the big back print the chase camera looks at
  drawWordmark(ctx, BRAND.name, 164, 172, 15, css(ink));
  drawWordmark(ctx, w1, 381, 166, 78, css(ink), { stroke: 'rgba(0,0,0,0.25)', strokeW: 5 });
  drawWordmark(ctx, w2, 388, 262, 78, css(ink), { stroke: 'rgba(0,0,0,0.25)', strokeW: 5 });
  ctx.fillStyle = css(ink);
  ctx.fillRect(330, 318, 108, 6);
  // back label
  ctx.fillStyle = css(side);
  roundRect(ctx, 360, 350, 48, 30, 5);
  ctx.fill();
  drawWordmark(ctx, w1.slice(0, 1) + (w2.slice(0, 1) || ''), 384, 365, 15, css(contrast(side, look.accent)));
  rctx.fillStyle = grey(0.5);
  rctx.fillRect(320, 120, 130, 190);
}

// ───────────────────────────────────────────────────────────────── Legs ──

/** Shorts leg wrap (256²): u around the thigh, v = hem (bottom) → hip (top). */
function paintLegs(ctx: Ctx, rctx: Ctx, o: Outfit): void {
  const look = o.bottomLook;
  ctx.fillStyle = css(look.primary);
  ctx.fillRect(0, 0, 256, 256);
  rctx.fillStyle = grey(0.86);
  rctx.fillRect(0, 0, 256, 256);
  paintGraphic(ctx, 0, 0, 256, 256, { ...look, graphic: look.graphic === 'logo' ? 'plain' : look.graphic }, 3);
  const ink = contrast(look.primary, look.accent);
  ctx.fillStyle = css(ink);
  ctx.fillRect(-4, 0, 8, 256);
  ctx.fillRect(252, 0, 8, 256);
  ctx.fillRect(124, 0, 8, 256);
  ctx.fillStyle = css(shade(look.primary, -0.3));
  ctx.fillRect(0, 238, 256, 18);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 236);
  ctx.lineTo(256, 236);
  ctx.stroke();
  // cargo pockets on the side seams (u = 0/256 and 128): patch, flap, stitching
  const pocket = shade(look.primary, luma(look.primary) > 0.35 ? -0.1 : 0.1);
  const flap = shade(look.primary, luma(look.primary) > 0.35 ? -0.2 : 0.18);
  for (const cx of [0, 128, 256]) {
    ctx.fillStyle = css(pocket);
    roundRect(ctx, cx - 34, 112, 68, 82, 8);
    ctx.fill();
    ctx.fillStyle = css(flap);
    roundRect(ctx, cx - 37, 104, 74, 26, 6);
    ctx.fill();
    ctx.strokeStyle = rgba(contrast(look.primary, 0xffffff), 0.35);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    roundRect(ctx, cx - 30, 116, 60, 74, 6);
    ctx.stroke();
    roundRect(ctx, cx - 33, 107, 66, 20, 5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(cx - 34, 192, 68, 3);
    rctx.fillStyle = grey(0.9);
    rctx.fillRect(cx - 37, 104, 74, 92);
  }
  drawWordmark(ctx, BRAND.name, 64, 206, 13, css(ink));
  drawWordmark(ctx, BRAND.name, 192, 206, 13, css(ink));
  softShade(ctx, 0, 0, 256, 256, 0.16, true);
}

// ───────────────────────────────────────────────────────────────── Boot ──

/** Binding boot cuff wrap (256²): front centre at u = 64, back at 192; v = ankle (bottom) → collar (top). */
function paintBoot(ctx: Ctx, rctx: Ctx, o: Outfit): void {
  const look = o.bindings;
  if (look.graphic === 'mark') {
    paintBlackBoot(ctx, rctx, look);
    return;
  }
  const ink = contrast(look.secondary, look.accent);
  ctx.fillStyle = css(look.primary);
  ctx.fillRect(0, 0, 256, 256);
  rctx.fillStyle = grey(0.6);
  rctx.fillRect(0, 0, 256, 256);
  paintGraphic(ctx, 0, 0, 256, 256, { ...look, graphic: look.graphic === 'logo' ? 'plain' : look.graphic }, 17);
  // padded collar
  ctx.fillStyle = css(shade(look.primary, luma(look.primary) > 0.4 ? -0.35 : 0.14));
  ctx.fillRect(0, 0, 256, 30);
  // tongue + laces
  ctx.fillStyle = '#131417';
  ctx.fillRect(40, 0, 48, 256);
  ctx.strokeStyle = '#e9e9e9';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let y = 44; y < 240; y += 34) {
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(86, y + 24);
    ctx.moveTo(86, y);
    ctx.lineTo(42, y + 24);
    ctx.stroke();
  }
  // two straps with logo
  ctx.fillStyle = css(look.secondary);
  for (const y of [66, 158]) {
    roundRect(ctx, -30, y, 150, 34, 6);
    ctx.fill();
    ctx.fillStyle = css(ink);
    ctx.fillRect(-30, y + 30, 150, 4);
    ctx.fillStyle = css(look.secondary);
  }
  roundRect(ctx, 226, 66, 60, 34, 6);
  ctx.fill();
  roundRect(ctx, 226, 158, 60, 34, 6);
  ctx.fill();
  drawWordmark(ctx, BRAND.name, 64, 83, 14, css(ink));
  drawWordmark(ctx, BRAND.name, 64, 175, 14, css(ink));
  rctx.fillStyle = grey(0.4);
  rctx.fillRect(0, 66, 256, 34);
  rctx.fillRect(0, 158, 256, 34);
  // heel spine + pull loop
  ctx.fillStyle = css(look.secondary);
  ctx.fillRect(180, 20, 24, 236);
  ctx.fillStyle = css(ink);
  ctx.fillRect(189, 30, 6, 226);
  softShade(ctx, 0, 0, 256, 256, 0.14, true);
}

/**
 * Full-black closed boot cuff (Spanish Mafia style): leather panels with stitching, mesh collar,
 * two wide slotted straps with a white ?! on the ends, round patch on the tongue.
 */
function paintBlackBoot(ctx: Ctx, rctx: Ctx, look: Outfit['bindings']): void {
  ctx.fillStyle = css(look.primary);
  ctx.fillRect(0, 0, 256, 256);
  rctx.fillStyle = grey(0.55);
  rctx.fillRect(0, 0, 256, 256);
  // leather panels + stitching
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  for (const x of [24, 104, 150, 230]) {
    ctx.beginPath();
    ctx.moveTo(x, 34);
    ctx.lineTo(x + 6, 256);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // mesh collar
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, 256, 34);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let x = -34; x < 256; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 34, 34);
    ctx.moveTo(x + 34, 0);
    ctx.lineTo(x, 34);
    ctx.stroke();
  }
  rctx.fillStyle = grey(0.9);
  rctx.fillRect(0, 0, 256, 34);
  // tongue with the round patch (front centre u = 64)
  ctx.fillStyle = '#0e0e10';
  ctx.fillRect(38, 0, 52, 256);
  ctx.fillStyle = '#f0f0f0';
  ctx.beginPath();
  ctx.arc(64, 62, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0e0e10';
  ctx.beginPath();
  ctx.arc(64, 62, 14, 0, Math.PI * 2);
  ctx.fill();
  drawBrandImage(ctx, 'mark', 64, 62, 14, 18, { tint: '#f0f0f0' });
  // two wide straps with slots, ?! on the ends
  for (const y of [92, 168]) {
    ctx.fillStyle = css(look.secondary);
    roundRect(ctx, -20, y, 296, 44, 8);
    ctx.fill();
    ctx.fillStyle = '#050506';
    for (let x = 6; x < 250; x += 16) {
      roundRect(ctx, x, y + 12, 7, 20, 3);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(-20, y, 296, 3);
    drawBrandImage(ctx, 'mark', 150, y + 22, 22, 30, { tint: '#f2f2f2' });
  }
  rctx.fillStyle = grey(0.35);
  rctx.fillRect(0, 92, 256, 44);
  rctx.fillRect(0, 168, 256, 44);
  // heel pull loop
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(180, 0, 24, 90);
  softShade(ctx, 0, 0, 256, 256, 0.14, true);
}

// ───────────────────────────────────────────────────────────── Headwear ──

/** Helmet / cap wrap (512×192): front centre at u = 128, back at 384; v = rim (bottom) → crown (top). */
function paintHeadwear(ctx: Ctx, rctx: Ctx, o: Outfit): void {
  const look = o.headLook;
  const ink = contrast(look.primary, look.accent);
  ctx.fillStyle = css(look.primary);
  ctx.fillRect(0, 0, 512, 192);
  if (o.headwear === 'helmet') {
    rctx.fillStyle = grey(0.26);
    rctx.fillRect(0, 0, 512, 192);
    paintGraphic(ctx, 0, 0, 512, 192, { ...look, graphic: look.graphic === 'logo' || look.graphic === 'wood' ? 'plain' : look.graphic }, 23);
    // vents: two rings of slots
    ctx.fillStyle = '#08090a';
    for (const [y, xs, w] of [
      [34, [64, 128, 192, 320, 384, 448], 30],
      [76, [96, 160, 352, 416, 0, 256, 512], 26],
    ] as const) {
      for (const x of xs) {
        roundRect(ctx, x - w / 2, y - 5, w, 10, 5);
        ctx.fill();
      }
    }
    // ear guards (sides) with hearing holes
    const guard = luma(look.primary) > 0.45 ? shade(mix(look.primary, look.secondary, 0.35), -0.12) : shade(mix(look.primary, look.secondary, 0.35), 0.16);
    ctx.fillStyle = css(guard);
    for (const x of [0, 256, 512]) {
      ctx.beginPath();
      ctx.moveTo(x - 62, 192);
      ctx.quadraticCurveTo(x - 58, 122, x, 116);
      ctx.quadraticCurveTo(x + 58, 122, x + 62, 192);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#08090a';
      for (const [dx, dy] of [
        [0, 150],
        [-13, 162],
        [13, 162],
        [0, 174],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx, dy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = css(guard);
    }
    rctx.fillStyle = grey(0.5);
    for (const x of [0, 256, 512]) rctx.fillRect(x - 58, 122, 116, 70);
    // rim edge + brand hits front / back
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 184, 512, 8);
    drawWordmark(ctx, BRAND.name, 128, 138, 24, css(ink));
    drawWordmark(ctx, BRAND.name, 384, 140, 20, css(ink));
    if (look.graphic === 'mark') {
      // the "?!" mark on both sides of the shell, above the ear guards
      const markInk = luma(look.primary) > 0.5 ? css(look.secondary) : '#ffffff';
      for (const x of [256, 0, 512]) drawBrandImage(ctx, 'mark', x, 70, 64, 86, { tint: markInk });
    }
  } else {
    rctx.fillStyle = grey(0.9);
    rctx.fillRect(0, 0, 512, 192);
    paintGraphic(ctx, 0, 0, 512, 192, { ...look, graphic: look.graphic === 'logo' || look.graphic === 'wood' ? 'plain' : look.graphic }, 23);
    // six panel seams + eyelets
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const x = 42 + i * (512 / 6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 192);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(x + 43, 70, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // front patch
    const patch = contrast(look.primary, look.secondary);
    ctx.fillStyle = css(patch);
    roundRect(ctx, 70, 92, 116, 62, 8);
    ctx.fill();
    ctx.strokeStyle = css(contrast(patch, look.accent));
    ctx.lineWidth = 3;
    roundRect(ctx, 75, 97, 106, 52, 6);
    ctx.stroke();
    drawWordmark(ctx, BRAND.name, 128, 123, 22, css(contrast(patch, look.accent)));
    // sweat band + snap-back opening
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 178, 512, 14);
    ctx.fillStyle = '#0a0a0b';
    ctx.beginPath();
    ctx.ellipse(384, 192, 46, 44, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = css(shade(look.primary, -0.25));
    ctx.fillRect(338, 176, 92, 9);
  }
}
