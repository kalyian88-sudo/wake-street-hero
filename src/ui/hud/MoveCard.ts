/**
 * Context move card: a compact panel on the right edge that always shows what the player can do RIGHT
 * NOW — on the water, approaching a rail / kicker, in the air, on a rail (slides, presses, blunts).
 * The active rail stance is highlighted, so the player sees that the slide actually happened.
 * Rebuilds its rows only when the context changes (no per-frame DOM work).
 */
import { getTrick } from '../../data/tricks';
import type { BoardKind, ObstacleDef, RailStance, RiderSimState, SpotDef } from '../../types';
import { h, txt, type HudCtx } from './dom';

type Btn = 'jump' | 'trick' | 'grab' | 'stick' | 'swipe' | 'tap' | 'hold';
interface Row {
  btn: Btn | null;
  dir: '' | '←' | '→' | '↑' | '↓' | '←/→' | '←←' | '→→';
  /** Trick table id (localised name) or an i18n key prefixed with "@". */
  label: string;
  /** Rail stance this row selects (highlighted while active). */
  stance?: RailStance;
}

const WATER: Row[] = [
  { btn: 'jump', dir: '', label: '@hud.moves.pop' },
  { btn: 'trick', dir: '←/→', label: 'surface180' },
];

const AIR_WAKEBOARD: Row[] = [
  { btn: 'stick', dir: '←/→', label: '@hud.moves.spin' },
  { btn: 'trick', dir: '↑', label: 'backroll' },
  { btn: 'trick', dir: '↓', label: 'frontroll' },
  { btn: 'grab', dir: '', label: 'indy' },
  { btn: 'grab', dir: '←', label: 'melon' },
  { btn: 'grab', dir: '→', label: 'mute' },
];

const AIR_WAKESKATE: Row[] = [
  { btn: 'stick', dir: '←/→', label: '@hud.moves.spin' },
  { btn: 'grab', dir: '', label: 'shuvit' },
  { btn: 'grab', dir: '←', label: 'kickflip' },
  { btn: 'grab', dir: '→', label: 'heelflip' },
  { btn: 'grab', dir: '↓', label: 'treflip' },
  { btn: 'grab', dir: '', label: '@hud.moves.catch' },
];

const RAIL: Row[] = [
  { btn: 'stick', dir: '←', label: 'rail.boardslide', stance: 'boardslide' },
  { btn: 'stick', dir: '→', label: 'rail.lipslide', stance: 'lipslide' },
  { btn: 'stick', dir: '↑', label: 'rail.nosepress', stance: 'nosepress' },
  { btn: 'stick', dir: '↓', label: 'rail.tailpress', stance: 'tailpress' },
  { btn: 'trick', dir: '←', label: 'rail.noseblunt', stance: 'noseblunt' },
  { btn: 'trick', dir: '→', label: 'rail.tailblunt', stance: 'tailblunt' },
  { btn: 'trick', dir: '↑', label: 'rail.noseslide', stance: 'noseslide' },
  { btn: 'trick', dir: '↓', label: 'rail.tailslide', stance: 'tailslide' },
  { btn: 'jump', dir: '', label: '@hud.moves.popoff' },
];

// one-finger scheme (src/input/Swipe.ts)
const S_WATER: Row[] = [
  { btn: 'swipe', dir: '↑', label: '@hud.moves.jump' },
  { btn: 'swipe', dir: '←/→', label: '@hud.moves.lane' },
  { btn: 'swipe', dir: '↓', label: 'surface180' },
];
const S_AIR_WAKEBOARD: Row[] = [
  { btn: 'swipe', dir: '←/→', label: '@hud.moves.spin180' },
  { btn: 'swipe', dir: '↑', label: 'backroll' },
  { btn: 'swipe', dir: '↓', label: 'frontroll' },
  { btn: 'hold', dir: '', label: 'indy' },
];
const S_AIR_WAKESKATE: Row[] = [
  { btn: 'swipe', dir: '←/→', label: '@hud.moves.spin180' },
  { btn: 'swipe', dir: '↑', label: 'kickflip' },
  { btn: 'swipe', dir: '↓', label: 'heelflip' },
  { btn: 'tap', dir: '', label: '@hud.moves.catch' },
];
const S_RAIL: Row[] = [
  { btn: 'swipe', dir: '←', label: 'rail.boardslide', stance: 'boardslide' },
  { btn: 'swipe', dir: '→', label: 'rail.lipslide', stance: 'lipslide' },
  { btn: 'swipe', dir: '↑', label: 'rail.nosepress', stance: 'nosepress' },
  { btn: 'swipe', dir: '↓', label: 'rail.tailpress', stance: 'tailpress' },
  { btn: 'swipe', dir: '←←', label: 'rail.noseblunt', stance: 'noseblunt' },
  { btn: 'swipe', dir: '→→', label: 'rail.tailblunt', stance: 'tailblunt' },
  { btn: 'tap', dir: '', label: '@hud.moves.popoff' },
];

type Ctx = 'water' | 'aheadRail' | 'aheadKicker' | 'air' | 'rail' | 'none';

export class MoveCard {
  private readonly el: HTMLElement;
  private readonly title: Text;
  private readonly list: HTMLElement;
  private rows: { el: HTMLElement; stance?: RailStance }[] = [];
  private ctxKey = '';
  private stance: RailStance | null = null;
  private obstacles: ObstacleDef[] = [];
  private board: BoardKind = 'wakeboard';
  private aheadT = 0;
  private swipe = false;

  setSwipe(on: boolean): void {
    if (on === this.swipe) return;
    this.swipe = on;
    this.ctxKey = '';
  }

  constructor(
    root: HTMLElement,
    private readonly ctx: HudCtx,
  ) {
    this.el = h('div', 'wsh-moves', root);
    this.title = txt(h('div', 'wsh-moves-title wsh-x', this.el));
    this.list = h('div', 'wsh-moves-list', this.el);
  }

  reset(spot: SpotDef, board: BoardKind): void {
    this.obstacles = spot.obstacles;
    this.board = board;
    this.ctxKey = '';
    this.stance = null;
    this.el.classList.remove('is-on');
  }

  /** Language changed: rebuild on the next update. */
  relabel(): void {
    this.ctxKey = '';
  }

  update(s: RiderSimState, dt: number): void {
    const c = this.context(s, dt);
    const key = `${c}|${this.board}|${this.swipe ? 's' : 'c'}`;
    if (key !== this.ctxKey) {
      this.ctxKey = key;
      this.build(c);
    }
    const st = s.rail ? s.rail.stance : null;
    if (st !== this.stance) {
      this.stance = st;
      for (const r of this.rows) r.el.classList.toggle('is-active', !!r.stance && r.stance === st);
    }
  }

  private context(s: RiderSimState, dt: number): Ctx {
    switch (s.mode) {
      case 'air':
        return 'air';
      case 'rail':
        return 'rail';
      case 'water':
      case 'slide': {
        // look ~4–16 m ahead along the travel direction for something to pop onto
        const ahead = this.ahead(s);
        if (ahead) this.aheadT = 1.2;
        else this.aheadT = Math.max(0, this.aheadT - dt);
        if (ahead) return ahead;
        return this.aheadT > 0 && this.ctxKey.startsWith('ahead') ? (this.ctxKey.split('|')[0] as Ctx) : 'water';
      }
      default:
        return 'none';
    }
  }

  private ahead(s: RiderSimState): Ctx | null {
    const yaw = s.heading;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let best: Ctx | null = null;
    let bestD = 17;
    for (const o of this.obstacles) {
      let x: number;
      let z: number;
      let kind: Ctx;
      if (o.kind === 'rail') {
        const p = o.path[0];
        const q = o.path[o.path.length - 1];
        // nearer end of the rail
        const dp = Math.hypot(p[0] - s.pos.x, p[2] - s.pos.z);
        const dq = Math.hypot(q[0] - s.pos.x, q[2] - s.pos.z);
        [x, z] = dp < dq ? [p[0], p[2]] : [q[0], q[2]];
        kind = 'aheadRail';
      } else if (o.kind === 'ledge') {
        x = o.pos[0];
        z = o.pos[2] - o.size[2] / 2;
        kind = 'aheadRail';
      } else if (o.kind === 'kicker') {
        x = o.pos[0];
        z = o.pos[2];
        kind = 'aheadKicker';
      } else continue;
      const dx = x - s.pos.x;
      const dz = z - s.pos.z;
      const along = dx * fx + dz * fz;
      if (along < 3 || along > bestD) continue;
      const side = Math.abs(dx * fz - dz * fx);
      if (side > 3.2) continue;
      bestD = along;
      best = kind;
    }
    return best;
  }

  private build(c: Ctx): void {
    const t = this.ctx.t;
    let rows: Row[] = [];
    let title = '';
    let hot = false;
    switch (c) {
      case 'water':
        rows = this.swipe ? S_WATER : WATER;
        title = t('hud.moves.water');
        break;
      case 'aheadRail':
        rows = [this.swipe ? { btn: 'swipe', dir: '↑', label: '@hud.moves.jump' } : { btn: 'jump', dir: '', label: '@hud.moves.pop' }];
        title = t('hud.moves.aheadRail');
        hot = true;
        break;
      case 'aheadKicker':
        rows = [this.swipe ? { btn: 'swipe', dir: '↑', label: '@hud.moves.jump' } : { btn: 'jump', dir: '', label: '@hud.moves.pop' }];
        title = t(this.swipe ? 'hud.moves.aheadKickerSwipe' : 'hud.moves.aheadKicker');
        hot = true;
        break;
      case 'air':
        rows = this.swipe ? (this.board === 'wakeskate' ? S_AIR_WAKESKATE : S_AIR_WAKEBOARD) : this.board === 'wakeskate' ? AIR_WAKESKATE : AIR_WAKEBOARD;
        title = t('hud.moves.air');
        break;
      case 'rail':
        rows = this.swipe ? S_RAIL : RAIL;
        title = t('hud.moves.rail');
        break;
      default:
        rows = [];
    }
    this.title.data = title;
    this.el.classList.toggle('is-on', rows.length > 0);
    this.el.classList.toggle('is-hot', hot);
    this.el.classList.toggle('is-rail', c === 'rail');
    this.list.textContent = '';
    this.rows = rows.map((r) => {
      const row = h('div', 'wsh-move', this.list);
      if (r.btn) {
        const key =
          r.btn === 'stick' || r.btn === 'swipe' || r.btn === 'tap' || r.btn === 'hold'
            ? `hud.moves.${r.btn}`
            : r.btn === 'grab' && this.board === 'wakeskate'
              ? 'hud.btn.flip'
              : `hud.btn.${r.btn}`;
        h('span', `wsh-move-btn wsh-move-btn--${r.btn} wsh-x`, row, t(key));
      }
      if (r.dir) h('span', 'wsh-move-dir', row, r.dir);
      h('span', 'wsh-move-name', row, this.label(r.label));
      if (r.stance && r.stance === this.stance) row.classList.add('is-active');
      return { el: row, stance: r.stance };
    });
  }

  private label(id: string): string {
    if (id.startsWith('@')) return this.ctx.t(id.slice(1));
    const def = getTrick(id);
    return def ? this.ctx.l(def.name) : id;
  }
}
