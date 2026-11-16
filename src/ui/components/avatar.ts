/**
 * Flat SVG stand-ins for 3D people: the rider mannequin shown in the rider editor until the 3D
 * turntable backdrop exists, and the speaker portraits of the dialog cards.
 */
import { SKIN_TONES } from '../../config';
import { getGear } from '../../data/gear';
import type { EquippedGear, RiderAppearance } from '../../types';
import { h, hex, shade } from '../dom';

function hair(style: RiderAppearance['hair'], color: string, dark: string, female: boolean): { back: string; front: string } {
  switch (style) {
    case 'buzz':
      return { back: '', front: `<path d="M74 58a26 26 0 0 1 52 0c-8-9-18-12-26-12s-18 3-26 12z" fill="${color}" opacity=".85"/>` };
    case 'curly':
      return {
        back: `<g fill="${dark}"><circle cx="72" cy="58" r="11"/><circle cx="128" cy="58" r="11"/></g>`,
        front: `<g fill="${color}"><circle cx="78" cy="44" r="11"/><circle cx="92" cy="36" r="12"/><circle cx="108" cy="36" r="12"/><circle cx="122" cy="44" r="11"/><circle cx="73" cy="55" r="8"/><circle cx="127" cy="55" r="8"/></g>`,
      };
    case 'long':
      return {
        back: `<path d="M70 60c0-22 12-32 30-32s30 10 30 32v${female ? 62 : 48}c-6 6-12 4-14-2V70H84v20c-2 6-8 8-14 2z" fill="${dark}"/>`,
        front: `<path d="M72 62c0-18 10-30 28-30s28 12 28 30c-6-10-14-15-28-15S78 52 72 62z" fill="${color}"/>`,
      };
    case 'bun':
      return {
        back: `<circle cx="100" cy="27" r="12" fill="${dark}"/>`,
        front: `<path d="M72 60c0-18 10-28 28-28s28 10 28 28c-6-9-14-13-28-13s-22 4-28 13z" fill="${color}"/><circle cx="100" cy="26" r="9" fill="${color}"/>`,
      };
    case 'ponytail':
      return {
        back: `<path d="M122 44c16 2 24 16 20 40-2 12-8 20-14 24 4-14 2-26-4-34z" fill="${dark}"/>`,
        front: `<path d="M72 60c0-18 10-28 28-28s28 10 28 28c-6-9-14-13-28-13s-22 4-28 13z" fill="${color}"/>`,
      };
    default:
      return { back: '', front: `<path d="M72 62c0-20 10-31 28-31s28 11 28 31c-4-8-10-12-16-13-8 5-22 5-32 1-4 3-6 7-8 12z" fill="${color}"/>` };
  }
}

/** Front-view rider on a board, coloured from the appearance + equipped gear. */
export function riderAvatar(a: RiderAppearance, equipped: EquippedGear): HTMLElement {
  const female = a.gender === 'female';
  const skin = hex(SKIN_TONES[a.skin] ?? SKIN_TONES[1]);
  const skinDark = shade(SKIN_TONES[a.skin] ?? SKIN_TONES[1], -0.18);
  const helmetGear = getGear(equipped.helmet);
  const vestGear = getGear(equipped.vest);
  const apparelGear = getGear(equipped.apparel);
  const boardGear = getGear(equipped.wakeboard);

  const headwear = helmetGear ? (helmetGear.headKind === 'cap' ? 'cap' : 'helmet') : a.headwear;
  const headColor = helmetGear ? helmetGear.look.primary : a.headwearColor;
  const vestOn = vestGear ? true : a.vest;
  const vestColor = vestGear ? vestGear.look.primary : a.vestColor;
  const wetsuit = apparelGear?.apparelKind ? apparelGear.apparelKind === 'wetsuit' : a.bottom === 'wetsuit';
  const bottomColor = apparelGear && (apparelGear.apparelKind === 'shorts' || apparelGear.apparelKind === 'wetsuit') ? apparelGear.look.primary : a.bottomColor;
  const topColor = apparelGear && (apparelGear.apparelKind === 'tee' || apparelGear.apparelKind === 'hoodie') ? apparelGear.look.primary : a.topColor;

  const sh = female ? 30 : 35; // half shoulder width
  const waist = female ? 23 : 29;
  const hip = female ? 30 : 29;
  const suit = hex(bottomColor);
  const top = wetsuit ? suit : hex(topColor);
  const limb = wetsuit ? suit : skin;
  const hairParts = headwear === 'helmet' ? { back: a.hair === 'long' || a.hair === 'ponytail' ? hair(a.hair, hex(a.hairColor), shade(a.hairColor, -0.25), female).back : '', front: '' } : hair(a.hair, hex(a.hairColor), shade(a.hairColor, -0.25), female);

  const torso = `M${100 - sh} 104Q100 94 ${100 + sh} 104L${100 + waist} 152Q${100 + waist} 164 ${100 + hip} 172H${100 - hip}Q${100 - waist} 164 ${100 - waist} 152Z`;
  const vestPath = `M${100 - sh + 5} 101Q100 92 ${100 + sh - 5} 101L${100 + waist + 2} 150H${100 - waist - 2}Z`;
  const deck = boardGear ? hex(boardGear.look.primary) : '#e30613';

  const svg =
    `<svg viewBox="0 0 200 300" aria-hidden="true">` +
    `<ellipse cx="100" cy="276" rx="88" ry="10" fill="rgba(0,0,0,.4)"/>` +
    `<rect x="14" y="258" width="172" height="15" rx="7.5" fill="${deck}"/><rect x="14" y="258" width="172" height="5" rx="2.5" fill="rgba(255,255,255,.22)"/>` +
    // legs
    `<rect x="${100 - hip + 1}" y="164" width="25" height="96" rx="11" fill="${limb}"/><rect x="${100 + hip - 26}" y="164" width="25" height="96" rx="11" fill="${limb}"/>` +
    (wetsuit ? '' : `<path d="M${100 - hip} 162h${hip * 2}l3 48h-${hip + 1}l-2-24-2 24h-${hip + 1}z" fill="${suit}"/>`) +
    `<rect x="${100 - hip - 4}" y="244" width="34" height="18" rx="7" fill="#17181c"/><rect x="${100 + hip - 30}" y="244" width="34" height="18" rx="7" fill="#17181c"/>` +
    // arms
    `<rect x="${100 - sh - 15}" y="103" width="19" height="78" rx="9.5" fill="${limb}" transform="rotate(7 ${100 - sh - 5} 105)"/>` +
    `<rect x="${100 + sh - 4}" y="103" width="19" height="78" rx="9.5" fill="${limb}" transform="rotate(-7 ${100 + sh + 5} 105)"/>` +
    (wetsuit ? '' : `<rect x="${100 - sh - 15}" y="103" width="19" height="34" rx="9.5" fill="${top}" transform="rotate(7 ${100 - sh - 5} 105)"/><rect x="${100 + sh - 4}" y="103" width="19" height="34" rx="9.5" fill="${top}" transform="rotate(-7 ${100 + sh + 5} 105)"/>`) +
    // torso
    `<path d="${torso}" fill="${top}"/>` +
    (vestOn
      ? `<path d="${vestPath}" fill="${hex(vestColor)}"/><path d="M100 97v53" stroke="rgba(0,0,0,.35)" stroke-width="2.5"/><rect x="106" y="114" width="14" height="6" rx="2" fill="rgba(255,255,255,.85)"/>`
      : '') +
    // head
    hairParts.back +
    `<rect x="92" y="82" width="16" height="18" rx="6" fill="${skinDark}"/>` +
    `<circle cx="100" cy="60" r="27" fill="${skin}"/><circle cx="73" cy="63" r="5" fill="${skin}"/><circle cx="127" cy="63" r="5" fill="${skin}"/>` +
    `<circle cx="90" cy="62" r="2.6" fill="#1c1d21"/><circle cx="110" cy="62" r="2.6" fill="#1c1d21"/><path d="M91 73q9 7 18 0" stroke="#1c1d21" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    hairParts.front +
    (headwear === 'helmet'
      ? `<path d="M70 62a30 30 0 0 1 60 0v4h-8v-6H78v6h-8z" fill="${hex(headColor)}"/><path d="M70 60a30 30 0 0 1 60 0" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="3"/><path d="M76 66l4 16M124 66l-4 16" stroke="#17181c" stroke-width="2.5"/>`
      : headwear === 'cap'
        ? `<path d="M72 50a28 28 0 0 1 56 0z" fill="${hex(headColor)}"/><path d="M70 50h62c10 0 14 4 14 8H70z" fill="${shade(headColor, -0.25)}"/>`
        : '') +
    `</svg>`;
  return h('div', { class: 'wn-avatar', html: svg });
}

export type SpeakerRole = 'winch' | 'filmer' | 'manager' | 'rider';

export const ROLE_COLOR: Record<SpeakerRole, number> = { winch: 0xff7a1a, filmer: 0x19b5a5, manager: 0xe30613, rider: 0x5a8dee };

/** Bust portrait for dialog cards: role colour + one telling accessory. */
export function portrait(role: SpeakerRole): HTMLElement {
  const c = ROLE_COLOR[role];
  const skin = role === 'winch' ? '#c98f62' : role === 'filmer' ? '#f0c9a4' : role === 'manager' ? '#e2b48a' : '#d9a878';
  const shirt = role === 'manager' ? '#f4f4f4' : role === 'winch' ? '#2a2c33' : role === 'filmer' ? '#1c1d21' : '#30323a';
  let extra = '';
  if (role === 'winch') {
    // cap + beard
    extra = `<path d="M30 40a18 18 0 0 1 36 0z" fill="${hex(c)}"/><path d="M28 40h46c6 0 9 2 9 5H28z" fill="${shade(c, -0.3)}"/><path d="M33 54c2 14 28 14 30 0-4 5-26 5-30 0z" fill="#3b2a1c"/>`;
  } else if (role === 'filmer') {
    // beanie + camera
    extra = `<path d="M30 42a18 18 0 0 1 36 0v3H30z" fill="#1c1d21"/><rect x="29" y="40" width="38" height="7" rx="3" fill="${shade(c, -0.15)}"/><rect x="56" y="62" width="30" height="20" rx="4" fill="#101114"/><circle cx="71" cy="72" r="6.5" fill="#30323a" stroke="#fff" stroke-width="1.6"/><rect x="60" y="58" width="9" height="5" rx="1.5" fill="#101114"/>`;
  } else if (role === 'manager') {
    // snapback + shades
    extra = `<path d="M30 40a18 18 0 0 1 36 0z" fill="#101114"/><path d="M22 40h44v5H22z" fill="#101114"/><rect x="42" y="30" width="12" height="6" rx="1.5" fill="${hex(c)}"/><rect x="33" y="46" width="13" height="8" rx="3" fill="#101114"/><rect x="50" y="46" width="13" height="8" rx="3" fill="#101114"/><path d="M46 49h4" stroke="#101114" stroke-width="2"/>`;
  } else {
    extra = `<path d="M30 42a18 18 0 0 1 36 0v6h-5v-6H35v6h-5z" fill="#101114"/>`;
  }
  const svg =
    `<svg viewBox="0 0 96 96" aria-hidden="true"><defs><clipPath id="wnp-${role}"><circle cx="48" cy="48" r="46"/></clipPath></defs>` +
    `<circle cx="48" cy="48" r="46" fill="${hex(c)}"/><path d="M48 2a46 46 0 0 1 46 46H48z" fill="rgba(255,255,255,.12)"/>` +
    `<g clip-path="url(#wnp-${role})"><path d="M14 100c0-22 14-32 34-32s34 10 34 32z" fill="${shirt}"/><rect x="42" y="58" width="12" height="14" rx="5" fill="${skin}"/>` +
    `<circle cx="48" cy="46" r="17" fill="${skin}"/>${role === 'manager' ? '' : '<circle cx="42" cy="48" r="1.9" fill="#1c1d21"/><circle cx="54" cy="48" r="1.9" fill="#1c1d21"/>'}<path d="M43 56q5 4 10 0" stroke="#1c1d21" stroke-width="1.8" fill="none" stroke-linecap="round"/>${extra}</g>` +
    `<circle cx="48" cy="48" r="45" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/></svg>`;
  return h('div', { class: `wn-portrait wn-portrait--${role}`, html: svg });
}
