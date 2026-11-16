/**
 * SIM SANDBOX — 2-D view of the headless simulation: top-down map of the collision world
 * (ICollisionWorld.debugShapes()), a height profile, the live rider with its trail, and a small HUD.
 * Keyboard: arrows = stick, Space = JUMP, X = TRICK, C = GRAB/FLIP, V = HANDLE, Shift = HERO,
 * A = autopilot, R = restart. URL: ?winch=main|left|right &board=wakeboard|wakeskate &power=slow|medium|fast
 * &auto=1 (autopilot) &tricks=0 &warp=<seconds simulated instantly> &rate=<sim speed multiplier>.
 */
import { NEUTRAL_STATS } from '../config';
import { EventBus } from '../core/events';
import { findSpot, getSpot } from '../data/spots';
import { createAutopilot, type Autopilot } from '../physics/autopilot';
import { InputScript, type Held } from '../physics/inputScript';
import { createRiderSim } from '../physics/RiderSim';
import type { BoardKind, CollisionDebugShape, IRiderSim, PowerLevel, RiderMode } from '../types';

const q = new URLSearchParams(location.search);
const spot = findSpot(q.get('spot') ?? '') ?? getSpot('phuket_oldtown');
let winchId = q.get('winch') ?? spot.winchPoints[0].id;
let board = (q.get('board') ?? 'wakeboard') as BoardKind;
let power = (q.get('power') ?? 'medium') as PowerLevel;
let auto = q.get('auto') === '1';
const tricks = q.get('tricks') !== '0';
const warp = Number(q.get('warp') ?? 0);
const rate = Number(q.get('rate') ?? 1);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

const MODE_COLOR: Record<RiderMode, string> = {
  waiting: '#7a8090',
  water: '#39b8e6',
  slide: '#ffa63d',
  air: '#ffffff',
  rail: '#ff2a3a',
  wall: '#c08bff',
  bail: '#69707d',
  finished: '#59d98e',
};

interface TrailPoint {
  x: number;
  y: number;
  z: number;
  mode: RiderMode;
}

let bus = new EventBus();
let sim: IRiderSim;
let bot: Autopilot;
let trail: TrailPoint[] = [];
let shapes: CollisionDebugShape[] = [];
let ticker: { text: string; t: number; color: string }[] = [];
const script = new InputScript();
const keys = new Set<string>();
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function start(): void {
  bus = new EventBus();
  sim = createRiderSim({ spot, winchId, power, board, stance: 'regular', stats: { ...NEUTRAL_STATS } }, bus);
  bot = createAutopilot(sim, { tricks });
  shapes = sim.world.debugShapes();
  trail = [];
  ticker = [];
  const say = (text: string, color = '#fff'): void => {
    ticker.unshift({ text, t: sim.state.time, color });
    if (ticker.length > 7) ticker.pop();
  };
  bus.on('score:trick', (e) => say(`${e.trick.name.en}  +${Math.round(e.awarded)}  ×${e.comboMult}  [${e.landing}]`, '#ffe14d'));
  bus.on('sim:bail', (e) => say(`BAIL: ${e.reason}`, '#ff5a66'));
  bus.on('sim:gap', (e) => say(`GAP: ${e.name.en}`, '#7ad957'));
  bus.on('sim:railEnter', (e) => say(`rail: ${e.obstacleId} (${e.kind})`, '#ff8a94'));
  bus.on('sim:wallEnter', (e) => say(`wall: ${e.obstacleId}`, '#c08bff'));
  bus.on('sim:takeoff', (e) => say(`takeoff: ${e.kind}${e.obstacleId ? ' ' + e.obstacleId : ''}`, '#b8c0cc'));
  bus.on('sim:ropeJerk', (e) => say(`rope jerk ${e.jerk.toFixed(1)} m/s`, '#ffa63d'));
  bus.on('score:bank', (e) => say(`banked ${Math.round(e.banked)}`, '#59d98e'));
  bus.on('sim:finish', () => say('FINISH', '#59d98e'));
  sim.go();
  if (warp > 0) for (let i = 0; i < warp * 60; i++) tick(1 / 60);
}

function playerInput(): Held {
  return {
    steer: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0),
    pitch: (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0),
    jump: keys.has('Space'),
    trick: keys.has('KeyX'),
    grab: keys.has('KeyC'),
    handle: keys.has('KeyV'),
    hero: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}

function tick(dt: number): void {
  const s = sim.state;
  // the game's slow-motion, so tricks can be timed by hand exactly as in the real thing
  const scale = 1 - 0.65 * s.slowMo;
  sim.step(dt * scale, auto ? bot.update() : script.set(playerInput()), scale);
  const last = trail[trail.length - 1];
  if (!last || last.mode !== s.mode || Math.hypot(s.pos.x - last.x, s.pos.z - last.z, s.pos.y - last.y) > 0.25) {
    trail.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z, mode: s.mode });
    if (trail.length > 6000) trail.shift();
  }
}

// ───────────────────────────────────────────────────────────── drawing ──

interface View {
  /** world (x, z) → screen for the map. */
  map(x: number, z: number): [number, number];
  /** (z, y) → screen for the height profile. */
  prof(z: number, y: number): [number, number];
  scale: number;
  profRect: [number, number, number, number];
  hud: [number, number];
}

function makeView(w: number, h: number): View {
  const b = spot.bounds;
  const sx = b.max[0] - b.min[0];
  const sz = b.max[1] - b.min[1];
  const pad = 10;
  if (h >= w) {
    // portrait: HUD on top, below it the map (+Z up, rider's left on screen left) and the height profile
    const top = 172;
    const scale = Math.min((h - top - pad) / sz, (w * 0.46) / sx);
    const mapW = sx * scale;
    const y0 = h - pad;
    const px = pad + mapW + 12;
    const pw = Math.max(60, w - px - pad);
    const py = pw / 5.4;
    return {
      scale,
      map: (x, z) => [pad + (b.max[0] - x) * scale, y0 - (z - b.min[1]) * scale],
      prof: (z, y) => [px + (y + 0.4) * py, y0 - (z - b.min[1]) * scale],
      profRect: [px, y0 - sz * scale, pw, sz * scale],
      hud: [pad + 2, 20],
    };
  }
  // landscape: +Z to the right, rider's left (+X) up; profile under the map, HUD under that
  const scale = Math.min((w - pad * 2) / sz, (h * 0.4) / sx);
  const mapH = sx * scale;
  const py0 = pad + mapH + 8;
  const ph = Math.max(50, Math.min(h - py0 - 96, 110));
  const py = ph / 5.4;
  return {
    scale,
    map: (x, z) => [pad + (z - b.min[1]) * scale, pad + (b.max[0] - x) * scale],
    prof: (z, y) => [pad + (z - b.min[1]) * scale, py0 + ph - (y + 0.4) * py],
    profRect: [pad, py0, sz * scale, ph],
    hud: [pad + 6, py0 + ph + 16],
  };
}

function poly(v: View, pts: number[], close: boolean, profile: boolean): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 3) {
    const [x, y] = profile ? v.prof(pts[i + 2], pts[i + 1]) : v.map(pts[i], pts[i + 2]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
}

function draw(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#101114';
  ctx.fillRect(0, 0, w, h);
  const v = makeView(w, h);
  const s = sim.state;

  // profile frame + height grid
  const [rx, ry, rw, rh] = v.profRect;
  ctx.fillStyle = '#16181d';
  ctx.fillRect(rx, ry, rw, rh);
  ctx.font = '9px ui-monospace, monospace';
  for (let m = 0; m <= 4; m++) {
    const a = v.prof(spot.bounds.min[1], m);
    const b2 = v.prof(spot.bounds.max[1], m);
    ctx.strokeStyle = m === 0 ? '#2aa7c9' : '#262a32';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b2[0], b2[1]);
    ctx.stroke();
    ctx.fillStyle = '#5a6170';
    ctx.fillText(`${m}m`, Math.min(a[0], b2[0]) + 2, Math.min(a[1], b2[1]) + 10);
  }

  // colliders: map + profile
  let lastLabel = '';
  for (const sh of shapes) {
    const closed = sh.kind !== 'line';
    const col = hex(sh.color);
    poly(v, sh.points, closed, false);
    if (sh.kind === 'poly' && sh.label === 'bounds') {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    if (sh.kind === 'poly' || sh.kind === 'box' || sh.kind === 'ramp') {
      ctx.globalAlpha = sh.kind === 'poly' ? 0.16 : 0.3;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = sh.kind === 'line' ? 2.2 : sh.kind === 'wall' ? 2 : 1;
    if (sh.kind === 'circle') ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (sh.kind === 'ramp' || sh.kind === 'line' || sh.kind === 'wall' || (sh.kind === 'box' && sh.points[1] < 0.8)) {
      poly(v, sh.points, closed, true);
      ctx.strokeStyle = col;
      ctx.lineWidth = sh.kind === 'line' ? 2 : 1;
      ctx.stroke();
      if (sh.label && sh.label !== lastLabel) {
        // name it once, next to its first point on the height profile
        lastLabel = sh.label;
        const [lx, ly] = v.prof(sh.points[2], Math.max(sh.points[1], 0));
        ctx.fillStyle = '#7d8696';
        ctx.fillText(sh.label, Math.min(lx + 6, rx + rw - sh.label.length * 5.4 - 2), ly + (h >= w ? -3 : 12));
      }
    }
  }

  // line start → winch
  const wp = spot.winchPoints.find((p) => p.id === winchId) ?? spot.winchPoints[0];
  ctx.strokeStyle = '#3a3c43';
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.moveTo(...v.map(wp.start[0], wp.start[2]));
  ctx.lineTo(...v.map(wp.pos[0], wp.pos[2]));
  ctx.stroke();
  ctx.setLineDash([]);

  // trail (map + profile)
  for (const profile of [false, true]) {
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b2 = trail[i];
      if (Math.hypot(a.x - b2.x, a.z - b2.z) > 3) continue; // respawn jump
      ctx.strokeStyle = MODE_COLOR[b2.mode];
      ctx.lineWidth = b2.mode === 'air' ? 1.2 : 2;
      ctx.beginPath();
      ctx.moveTo(...(profile ? v.prof(a.z, a.y) : v.map(a.x, a.z)));
      ctx.lineTo(...(profile ? v.prof(b2.z, b2.y) : v.map(b2.x, b2.z)));
      ctx.stroke();
    }
  }

  // rope + rider
  const [rxp, ryp] = v.map(s.pos.x, s.pos.z);
  const hp = v.map(s.rope.handlePos.x, s.rope.handlePos.z);
  const ap = v.map(s.rope.anchorPos.x, s.rope.anchorPos.z);
  ctx.strokeStyle = s.rope.taut ? '#e30613' : '#6b7280';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hp[0], hp[1]);
  ctx.lineTo(ap[0], ap[1]);
  ctx.stroke();
  ctx.fillStyle = '#e30613';
  ctx.fillRect(ap[0] - 4, ap[1] - 4, 8, 8);
  // board as an oriented bar
  const yaw = s.boardYaw;
  const fwd = v.map(s.pos.x + Math.sin(yaw) * 0.9, s.pos.z + Math.cos(yaw) * 0.9);
  const back = v.map(s.pos.x - Math.sin(yaw) * 0.7, s.pos.z - Math.cos(yaw) * 0.7);
  ctx.strokeStyle = MODE_COLOR[s.mode];
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(back[0], back[1]);
  ctx.lineTo(fwd[0], fwd[1]);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(fwd[0], fwd[1], 2.2, 0, Math.PI * 2);
  ctx.fill();
  const pp = v.prof(s.pos.z, s.pos.y);
  ctx.fillStyle = MODE_COLOR[s.mode];
  ctx.beginPath();
  ctx.arc(pp[0], pp[1], 3.5, 0, Math.PI * 2);
  ctx.fill();
  void rxp;
  void ryp;

  drawHud(v, w, h);
}

function drawHud(v: View, w: number, h: number): void {
  const s = sim.state;
  const sc = sim.score.state;
  const portrait = h >= w;
  ctx.font = '11px ui-monospace, monospace';
  const rows = portrait ? 11 : Math.max(3, Math.floor((h - v.hud[1] + 4) / 14));
  const colW = portrait ? 196 : 205;
  let n = 0;
  const line = (text: string, color = '#c9d1dc'): void => {
    ctx.fillStyle = color;
    ctx.fillText(text, v.hud[0] + Math.floor(n / rows) * colW, v.hud[1] + (n % rows) * 14);
    n++;
  };
  line(`${winchId} · ${board} · ${power}${auto ? ' · A' : ''}`, '#fff');
  line(`t ${s.time.toFixed(1)}s  ${s.mode}`, MODE_COLOR[s.mode]);
  line(`v ${s.speed.toFixed(1)} m/s  y ${s.pos.y.toFixed(2)}`);
  line(`rope ${s.rope.taut ? 'TAUT' : s.rope.holding ? 'slack' : 'released'} ${(s.rope.tension * 100).toFixed(0)}%`);
  line(`score ${Math.round(sc.total)}  +${Math.round(sc.comboPoints)}×${sc.comboMult}`, '#ffe14d');
  line(`falls ${sc.falls}  hero ${(sc.hero.meter * 100).toFixed(0)}%${sc.hero.active ? ' ON' : ''}`);
  line(`crouch ${(s.crouch * 100).toFixed(0)}%  ${s.switch ? 'SWITCH' : ''}`);
  if (s.mode === 'air') line(`air ${s.air.time.toFixed(2)}s  land in ${s.air.timeToLand.toFixed(2)}s`, '#fff');
  if (s.air.flip.id) line(`flip ${s.air.flip.id} ${(s.air.flip.progress * 100).toFixed(0)}% catch ${(s.air.flip.catchWindow * 100).toFixed(0)}%`, '#ffe14d');
  if (s.rail) {
    const bar = Math.round((s.rail.balance + 1) * 7);
    line(`${s.rail.stance} [${'·'.repeat(Math.max(0, bar))}|${'·'.repeat(Math.max(0, 14 - bar))}]`, Math.abs(s.rail.balance) > 0.7 ? '#ff2a3a' : '#ff8a94');
  }
  if (auto && bot.targetId) line(`→ ${bot.targetId}`, '#7ad957');
  // event ticker in the next free column
  n = Math.ceil(n / rows) * rows;
  const x = v.hud[0] + Math.floor(n / rows) * colW;
  const maxChars = Math.max(12, Math.floor((w - x - 6) / 6.7));
  for (const t of ticker) {
    ctx.globalAlpha = Math.max(0.4, 1 - (s.time - t.t) / 8);
    line(t.text.length > maxChars ? `${t.text.slice(0, maxChars - 1)}…` : t.text, t.color);
  }
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────── loop ──

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'KeyA') auto = !auto;
  else if (e.code === 'KeyR') start();
  else if (e.code === 'KeyB') {
    board = board === 'wakeboard' ? 'wakeskate' : 'wakeboard';
    start();
  } else if (e.code === 'KeyL') {
    const ids = spot.winchPoints.map((p) => p.id);
    winchId = ids[(ids.indexOf(winchId) + 1) % ids.length];
    start();
  } else if (e.code === 'KeyP') {
    power = power === 'slow' ? 'medium' : power === 'medium' ? 'fast' : 'slow';
    start();
  }
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e: KeyboardEvent) => keys.delete(e.code));

start();
let last = performance.now();
let idleFrames = 0;
function frame(now: number): void {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (warp <= 0 || rate !== 1) {
    const n = Math.max(1, Math.round(rate));
    for (let i = 0; i < n; i++) tick(real * (rate < 1 ? rate : 1));
  }
  // nothing moves after the finish: stop repainting once the last frame is on screen
  const idle = sim.state.mode === 'finished' && sim.state.speed < 0.02;
  idleFrames = idle ? idleFrames + 1 : 0;
  if (idleFrames < 20 || canvas.width !== Math.round(window.innerWidth * Math.min(2, window.devicePixelRatio || 1))) draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hooks
(window as unknown as Record<string, unknown>).__sim = {
  get sim() {
    return sim;
  },
  restart: start,
  ready: true,
};
