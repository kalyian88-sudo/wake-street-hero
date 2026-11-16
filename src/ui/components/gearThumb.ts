/** Procedural SVG thumbnails for shop items, tinted with the item's GearLook (no image files). */
import type { GearItem, GearLook } from '../../types';
import { h, hex, shade } from '../dom';

let uid = 0;

/** Deck graphic drawn inside the clip of a board outline (local box 0..40 × 0..96). */
function graphic(look: GearLook, id: string): string {
  const p = hex(look.primary);
  const s = hex(look.secondary);
  const a = hex(look.accent);
  switch (look.graphic) {
    case 'stripe':
      return `<rect width="40" height="96" fill="${p}"/><rect x="-10" y="38" width="60" height="13" fill="${s}" transform="rotate(-24 20 48)"/><rect x="-10" y="54" width="60" height="4" fill="${a}" transform="rotate(-24 20 48)"/>`;
    case 'split':
      return `<rect width="40" height="96" fill="${p}"/><path d="M0 52 40 40V96H0z" fill="${s}"/><path d="M0 50 40 38v4L0 54z" fill="${a}"/>`;
    case 'fade':
      return `<defs><linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p}"/><stop offset="1" stop-color="${s}"/></linearGradient></defs><rect width="40" height="96" fill="url(#${id}f)"/><rect x="17" y="10" width="6" height="76" rx="3" fill="${a}" opacity=".5"/>`;
    case 'checker': {
      let cells = '';
      for (let y = 0; y < 12; y++) for (let x = 0; x < 5; x++) if ((x + y) % 2 === 0) cells += `<rect x="${x * 8}" y="${y * 8}" width="8" height="8" fill="${s}"/>`;
      return `<rect width="40" height="96" fill="${p}"/>${cells}<rect y="40" width="40" height="16" fill="${a}"/>`;
    }
    case 'camo':
      return `<rect width="40" height="96" fill="${p}"/><g fill="${s}"><ellipse cx="9" cy="16" rx="10" ry="7"/><ellipse cx="30" cy="38" rx="11" ry="8"/><ellipse cx="10" cy="62" rx="12" ry="8"/><ellipse cx="31" cy="84" rx="10" ry="7"/></g><g fill="${a}" opacity=".55"><ellipse cx="27" cy="14" rx="6" ry="4"/><ellipse cx="12" cy="42" rx="6" ry="4"/><ellipse cx="29" cy="64" rx="6" ry="4"/></g>`;
    case 'wood': {
      let grain = '';
      for (let x = 5; x < 40; x += 7) grain += `<path d="M${x} 0c2 30-2 60 1 96" stroke="${shade(look.primary, -0.28)}" stroke-width="1" fill="none"/>`;
      return `<rect width="40" height="96" fill="${p}"/>${grain}<rect y="44" width="40" height="8" fill="${a}"/>`;
    }
    case 'flames':
      return `<rect width="40" height="96" fill="${p}"/><path d="M0 96V60c4 6 6-10 10-16 2 12 6 4 10-10 3 14 8 20 10 6 4 8 6 12 10 6v50z" fill="${s}"/><path d="M4 96V76c4 4 5-8 8-12 2 10 6 2 8-6 3 10 8 14 9 4 3 6 5 8 7 6v28z" fill="${a}"/>`;
    case 'tape':
      return `<rect width="40" height="96" fill="${p}"/><rect y="22" width="40" height="9" fill="${a}"/><rect y="65" width="40" height="9" fill="${a}"/><rect y="25" width="40" height="3" fill="${s}"/><rect y="68" width="40" height="3" fill="${s}"/>`;
    case 'logo':
      return `<rect width="40" height="96" fill="${p}"/><rect y="36" width="40" height="24" fill="${s}"/><path d="M7 43l3 10 4-8 4 8 3-10M24 53V43l8 10V43" stroke="${a}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    default:
      return `<rect width="40" height="96" fill="${p}"/><rect x="18" y="8" width="4" height="80" rx="2" fill="${s}" opacity=".6"/>`;
  }
}

function board(look: GearLook, skate: boolean): string {
  const id = `wng${uid++}`;
  const outline = skate ? '<rect x="2" y="10" width="36" height="76" rx="16"/>' : '<rect x="5" y="1" width="30" height="94" rx="15"/>';
  const extras = skate
    ? `<rect x="2" y="10" width="36" height="76" rx="16" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/><path d="M8 26h24M8 70h24" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>`
    : `<g fill="rgba(0,0,0,.42)"><ellipse cx="20" cy="30" rx="8" ry="10"/><ellipse cx="20" cy="66" rx="8" ry="10"/></g><rect x="5" y="1" width="30" height="94" rx="15" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="2"/>`;
  return `<g transform="translate(48 48) rotate(34) translate(-20 -48)"><clipPath id="${id}">${outline}</clipPath><g clip-path="url(#${id})">${graphic(look, id)}<rect width="14" height="96" fill="#fff" opacity=".12"/></g>${extras}</g>`;
}

function bindings(look: GearLook): string {
  const p = hex(look.primary);
  const s = hex(look.secondary);
  const a = hex(look.accent);
  return (
    `<path d="M30 14h22a8 8 0 0 1 8 8v22l17 11a14 14 0 0 1 7 12v9a4 4 0 0 1-4 4H24a6 6 0 0 1-6-6V26a12 12 0 0 1 12-12z" fill="${p}"/>` +
    `<path d="M18 68h66v8a4 4 0 0 1-4 4H24a6 6 0 0 1-6-6z" fill="${s}"/>` +
    `<path d="M22 34h36M22 46h38" stroke="${a}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M30 14h22a8 8 0 0 1 8 8v4H18a12 12 0 0 1 12-12z" fill="${shade(look.primary, -0.25)}"/>`
  );
}

function vest(look: GearLook): string {
  const p = hex(look.primary);
  const s = hex(look.secondary);
  const a = hex(look.accent);
  return (
    `<path d="M30 10c4 8 10 11 18 11s14-3 18-11l14 8c-5 8-6 14-6 22v40a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6V40c0-8-1-14-6-22z" fill="${p}"/>` +
    `<path d="M22 52h14v34h-8a6 6 0 0 1-6-6zM60 52h14v28a6 6 0 0 1-6 6h-8z" fill="${s}"/>` +
    `<path d="M48 22v64" stroke="${a}" stroke-width="3"/><rect x="53" y="34" width="14" height="6" rx="2" fill="${a}"/>`
  );
}

function head(look: GearLook, cap: boolean): string {
  const p = hex(look.primary);
  const s = hex(look.secondary);
  const a = hex(look.accent);
  if (cap) {
    return `<path d="M18 60a30 30 0 0 1 60 0z" fill="${p}"/><path d="M18 60h60c10 0 16 5 16 10H18z" fill="${s}"/><rect x="40" y="40" width="16" height="10" rx="2" fill="${a}"/><circle cx="48" cy="30" r="3" fill="${s}"/>`;
  }
  return (
    `<path d="M12 62a36 36 0 0 1 72 0v10a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="${p}"/>` +
    `<path d="M12 62h72v10a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="${s}"/>` +
    `<g fill="${shade(look.primary, -0.35)}"><rect x="34" y="34" width="6" height="14" rx="3"/><rect x="45" y="30" width="6" height="18" rx="3"/><rect x="56" y="34" width="6" height="14" rx="3"/></g>` +
    `<rect x="40" y="64" width="16" height="7" rx="2" fill="${a}"/>`
  );
}

function apparel(look: GearLook, kind: GearItem['apparelKind']): string {
  const p = hex(look.primary);
  const s = hex(look.secondary);
  const a = hex(look.accent);
  if (kind === 'wetsuit') {
    return `<path d="M36 8h24l18 10 6 30-10 3-6-18v25l4 30H54l-6-24-6 24H24l4-30V33l-6 18-10-3 6-30z" fill="${p}"/><path d="M36 8h24l-12 12z" fill="${s}"/><path d="M28 46h40" stroke="${a}" stroke-width="4"/><path d="M48 20v26" stroke="${s}" stroke-width="2.5"/>`;
  }
  if (kind === 'tee' || kind === 'hoodie') {
    const hood = kind === 'hoodie' ? `<path d="M34 16c2-10 26-10 28 0l-6 10H40z" fill="${s}"/><path d="M36 52h24v18H36z" fill="${shade(look.primary, -0.2)}"/>` : `<path d="M38 12h20l-10 9z" fill="${s}"/>`;
    return `<path d="M34 12h28l20 10-6 18-10-4v46H30V36l-10 4-6-18z" fill="${p}"/>${hood}<rect x="40" y="${kind === 'hoodie' ? 34 : 40}" width="16" height="6" rx="2" fill="${a}"/>`;
  }
  return `<path d="M20 16h56l8 62H56l-8-34-8 34H12z" fill="${p}"/><rect x="20" y="16" width="56" height="10" fill="${s}"/><path d="M62 30l14 2 4 34" stroke="${a}" stroke-width="5" fill="none"/>`;
}

export function gearThumb(item: GearItem): HTMLElement {
  let inner: string;
  switch (item.category) {
    case 'wakeboard':
      inner = board(item.look, false);
      break;
    case 'wakeskate':
      inner = board(item.look, true);
      break;
    case 'bindings':
      inner = bindings(item.look);
      break;
    case 'vest':
      inner = vest(item.look);
      break;
    case 'helmet':
      inner = head(item.look, item.headKind === 'cap');
      break;
    default:
      inner = apparel(item.look, item.apparelKind);
  }
  return h('div', { class: 'wn-thumb', html: `<svg viewBox="0 0 96 96" aria-hidden="true">${inner}</svg>` });
}
