/** Inline SVG icon set (24×24, currentColor). Static trusted markup — no image files. */
import { h } from './dom';

const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

/** Cog outline with `teeth` teeth, generated so it stays crisp at any size. */
function cog(teeth: number, r1: number, r2: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [da, r] of [
      [-0.3, r1],
      [-0.16, r2],
      [0.16, r2],
      [0.3, r1],
    ] as const) {
      const ang = a + da * step * 1.25;
      pts.push(`${(12 + Math.cos(ang) * r).toFixed(2)} ${(12 + Math.sin(ang) * r).toFixed(2)}`);
    }
  }
  return `M${pts.join('L')}Z`;
}

const PATHS = {
  back: `<path ${S} stroke-width="2.8" d="M15 4.5 7.5 12l7.5 7.5"/>`,
  next: `<path ${S} stroke-width="2.8" d="M9 4.5 16.5 12 9 19.5"/>`,
  close: `<path ${S} stroke-width="2.6" d="M6 6l12 12M18 6 6 18"/>`,
  check: `<path ${S} stroke-width="3" d="M4.5 12.5 9.5 17.5 19.5 6.5"/>`,
  lock: `<rect ${F} x="4.5" y="10.5" width="15" height="10.5" rx="2.4"/><path ${S} stroke-width="2.4" d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`,
  star: `<path ${F} d="M12 1.8l3.05 6.5 7.15.85-5.3 4.9 1.45 7.05L12 17.55l-6.35 3.55 1.45-7.05-5.3-4.9 7.15-.85z"/>`,
  settings: `<path ${F} fill-rule="evenodd" d="${cog(8, 7.6, 10.4)}M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/>`,
  shop: `<path ${F} d="M5.6 8.2h12.8a1 1 0 0 1 1 .92l.86 10.7A1.1 1.1 0 0 1 19.16 21H4.84a1.1 1.1 0 0 1-1.1-1.18L4.6 9.12a1 1 0 0 1 1-.92z"/><path ${S} d="M8.6 10.6V7a3.4 3.4 0 0 1 6.8 0v3.6" stroke="currentColor"/>`,
  rider: `<circle ${F} cx="12" cy="7" r="4"/><path ${F} d="M4 21c0-4.6 3.4-7.6 8-7.6s8 3 8 7.6z"/>`,
  tricks: `<path ${S} stroke-width="2.4" d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7"/><path ${S} stroke-width="2.4" d="M19.8 3.6v4.6h-4.6"/><path ${F} d="M10.2 9v6l5-3z"/>`,
  play: `<path ${F} d="M7.5 4.6v14.8a.7.7 0 0 0 1.06.6l12-7.4a.7.7 0 0 0 0-1.2l-12-7.4a.7.7 0 0 0-1.06.6z"/>`,
  pause: `<rect ${F} x="6" y="5" width="4.4" height="14" rx="1.2"/><rect ${F} x="13.6" y="5" width="4.4" height="14" rx="1.2"/>`,
  restart: `<path ${S} stroke-width="2.4" d="M4.5 12a7.5 7.5 0 1 0 2.6-5.7"/><path ${S} stroke-width="2.4" d="M4.2 3.6v4.6h4.6"/>`,
  replay: `<rect ${F} x="2.5" y="6.5" width="13" height="11" rx="2.4"/><path ${F} d="M16.5 11.2l4.3-2.9a.5.5 0 0 1 .78.42v6.56a.5.5 0 0 1-.78.42l-4.3-2.9z"/>`,
  share: `<path ${S} stroke-width="2.4" d="M12 14.5V3.2M7.8 7.2 12 3l4.2 4.2"/><path ${S} stroke-width="2.4" d="M7 10.8H5.2v9.7h13.6v-9.7H17"/>`,
  city: `<path ${F} d="M3.5 21V9.6l5-2.6v14zM10 21V4.2l6 2.4V21zM17.5 21v-9.4l3 1.4V21z"/>`,
  globe: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} stroke-width="1.8" d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>`,
  external: `<path ${S} stroke-width="2.4" d="M13.5 4.5h6v6M19.5 4.5l-8.6 8.6"/><path ${S} stroke-width="2.4" d="M17.5 14v5.5h-13v-13H10"/>`,
  bolt: `<path ${F} d="M13.6 1.8 4.8 13.4a.5.5 0 0 0 .4.8h5.1l-1.2 7.4a.4.4 0 0 0 .72.3l8.9-11.9a.5.5 0 0 0-.4-.8h-5l1-7.1a.4.4 0 0 0-.72-.3z"/>`,
  trophy: `<path ${F} d="M7 3h10v5.5a5 5 0 0 1-10 0z"/><path ${S} d="M7 5H4v1.6A3.4 3.4 0 0 0 7.4 10M17 5h3v1.6a3.4 3.4 0 0 1-3.4 3.4"/><path ${F} d="M10.8 13h2.4v4h-2.4zM7.8 17h8.4a.8.8 0 0 1 .8.8V21H7v-3.2a.8.8 0 0 1 .8-.8z"/>`,
  drop: `<path ${F} d="M12 2.4c3.6 4.6 6.4 7.8 6.4 11.2a6.4 6.4 0 0 1-12.8 0c0-3.4 2.8-6.6 6.4-11.2z"/>`,
  flame: `<path ${F} d="M12.4 1.8c.9 3.6 5.6 5.8 5.6 11.2a6 6 0 0 1-12 0c0-2.4 1.1-3.9 2.1-5.1.4 1.7 1.2 2.5 2.1 2.9-.5-3 .5-6.6 2.2-9z"/>`,
  target: `<circle ${S} cx="12" cy="12" r="8.8"/><circle ${S} cx="12" cy="12" r="4.6"/><circle ${F} cx="12" cy="12" r="1.7"/>`,
  route: `<circle ${F} cx="5.5" cy="18.5" r="2.6"/><circle ${F} cx="18.5" cy="5.5" r="2.6"/><path ${S} stroke-dasharray="1 4" d="M5.5 15.5c0-8 13-2.5 13-7"/>`,
  camera: `<path ${F} fill-rule="evenodd" d="M8.2 5.2 9.3 3.4a.9.9 0 0 1 .77-.44h3.86a.9.9 0 0 1 .77.44l1.1 1.8h3.4A1.8 1.8 0 0 1 21 7v11a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 18V7a1.8 1.8 0 0 1 1.8-1.8zM12 8.4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>`,
  letters: `<rect ${S} x="3" y="5" width="18" height="14" rx="2.6"/><path ${S} stroke-width="2.3" d="M7.2 9l1.7 6 3.1-5.4 3.1 5.4 1.7-6"/>`,
  pin: `<path ${F} fill-rule="evenodd" d="M12 22s-7.2-6.4-7.2-12a7.2 7.2 0 0 1 14.4 0c0 5.6-7.2 12-7.2 12zm0-14.8a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/>`,
  board: `<rect ${F} x="8" y="1.8" width="8" height="20.4" rx="4" transform="rotate(32 12 12)"/>`,
  music: `<path ${F} d="M9 4.6v10.1a3.3 3.3 0 1 0 2.2 3.1V8.3l7-1.7v6.1a3.3 3.3 0 1 0 2.2 3.1V2.4z"/>`,
  sound: `<path ${F} d="M3 9.2h3.6L11.4 5a.6.6 0 0 1 1 .45v13.1a.6.6 0 0 1-1 .45L6.6 14.8H3z"/><path ${S} d="M15.6 9a4.4 4.4 0 0 1 0 6M18.4 6.4a8 8 0 0 1 0 11.2"/>`,
  info: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} stroke-width="2.6" d="M12 11v6M12 7.2v.1"/>`,
  crown: `<path ${F} d="M3 18.5 4.4 7.4l4.9 4.3L12 5l2.7 6.7 4.9-4.3L21 18.5z"/>`,
  skip: `<path ${F} d="M4 5.4v13.2a.6.6 0 0 0 .95.5L13 13v5.6a.6.6 0 0 0 .95.5l8.3-6.6a.6.6 0 0 0 0-1L13.95 4.9a.6.6 0 0 0-.95.5V11L4.95 4.9a.6.6 0 0 0-.95.5z"/>`,
  trash: `<path ${S} d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10 10.5v6M14 10.5v6"/>`,
  home: `<path ${F} d="M3.2 11.4 12 3.2l8.8 8.2a.6.6 0 0 1-.4 1.04H19V20a1 1 0 0 1-1 1h-3.6v-5.6H9.6V21H6a1 1 0 0 1-1-1v-7.56H3.6a.6.6 0 0 1-.4-1.04z"/>`,
} as const;

export type IconName = keyof typeof PATHS;

export function iconSvg(name: IconName): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

/** `<span class="wn-ico">` holding the SVG; size it with font-size (1em square). */
export function icon(name: IconName, cls?: string): HTMLSpanElement {
  return h('span', { class: cls ? `wn-ico ${cls}` : 'wn-ico', html: iconSvg(name) });
}
