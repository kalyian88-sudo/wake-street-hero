/**
 * resolveTrick — turns a raw TrickRecord from the sim into a name (RU + EN), table ids and base points.
 * Pure and headless. All numbers and words come from src/data/tricks.ts.
 *
 * NAMING
 *  - air:     [Switch] [FS/BS] <spin> <invert> <flip> <shifty> <grab(s)> [over the Gap]
 *             A named combination (TrickDef.requires) replaces the components it consumes:
 *             backroll + 360 + indy → "Mobe Indy". FS/BS is only shown for spin-led tricks (no invert).
 *  - rail:    [Switch] [<spin> to] <stance> → <stance> <distance> m
 *  - wall:    [Switch] [<spin> to] Wallride
 *  - surface: Surface 180
 *
 * POINTS (base, before combo multiplier / staleness / landing quality — those are the score keeper's job)
 *  core  = named combination rows + the remaining components (grabs grow with hold time)
 *  total = core + stack bonus (several different elements in one air) + switch takeoff / landing
 *          + Big Air (height, hang time) + handle pass + pop-out / off-the-wall takeoff + gap points.
 *
 * `ids` lists every table id the trick satisfies (components, bonuses and EVERY matching combination) —
 * goals match against it. `id` is the headline (most specific) one. `elements` = how much the combo
 * multiplier grows (0 for a plain air / ollie).
 */
import { FLIP_MERGES, TRICKS, TRICK_TUNING as T, TRICK_WORDS as W, getTrick } from '../data/tricks';
import type { GrabId, InvertId, L10n, RailStance, ResolvedTrick, TrickDef, TrickPart, TrickRecord } from '../types';

type Requires = NonNullable<TrickDef['requires']>;

interface Combo {
  def: TrickDef;
  req: Requires;
  /** How many components the combination consumes — the most specific one wins. */
  weight: number;
}

/** Components of an air that are not (yet) claimed by a named combination. */
interface Work {
  spin: number;
  inverts: { id: InvertId; count: number }[];
  flips: { id: string; count: number }[];
  grabs: { id: GrabId; hold: number }[];
}

const MAX_ELEMENTS = 4;

function comboWeight(req: Requires): number {
  return (
    (req.spin !== undefined ? 1 : 0) +
    (req.invert !== undefined ? 1 : 0) +
    (req.grab !== undefined || req.anyGrab ? 1 : 0) +
    (req.flip !== undefined ? 1 : 0) +
    (req.takeoff !== undefined ? 1 : 0)
  );
}

const COMBOS: Combo[] = TRICKS.filter((t) => t.requires && !t.requires.rail)
  .map((def) => ({ def, req: def.requires as Requires, weight: comboWeight(def.requires as Requires) }))
  .filter((c) => c.weight > 0)
  .sort((a, b) => b.weight - a.weight || b.def.points - a.def.points);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (v: number, from: number, full: number): number => (full > from ? clamp01((v - from) / (full - from)) : v >= full ? 1 : 0);

function row(id: string): TrickDef {
  return (
    getTrick(id) ?? {
      id,
      name: { ru: id, en: id },
      category: 'special',
      boards: ['wakeboard', 'wakeskate'],
      points: 0,
      difficulty: 1,
      input: { ru: '', en: '' },
    }
  );
}

function joinNames(tokens: L10n[], sep = ' '): L10n {
  let ru = '';
  let en = '';
  for (const tk of tokens) {
    ru += (ru ? sep : '') + tk.ru;
    en += (en ? sep : '') + tk.en;
  }
  return { ru, en };
}

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** "Double Kickflip" / «Дабл кикфлип»; shuvits count in degrees: "360 Shuvit". */
function countedName(def: TrickDef, count: number): L10n {
  if (count <= 1) return def.name;
  if (def.id === 'shuvit' || def.id === 'fsShuvit') {
    const deg = String(180 * count);
    return { ru: `${deg} ${lowerFirst(def.name.ru)}`, en: `${deg} ${def.name.en}` };
  }
  const word: L10n = count === 2 ? W.double : count === 3 ? W.triple : { ru: `${count}×`, en: `${count}×` };
  return { ru: `${word.ru} ${lowerFirst(def.name.ru)}`, en: `${word.en} ${def.name.en}` };
}

function countFactor(table: number[], count: number): number {
  const last = table[table.length - 1] ?? 1;
  const prev = table[table.length - 2] ?? 1;
  if (count <= table.length) return table[Math.max(0, count - 1)] ?? 1;
  // beyond the table: keep growing by the last step ratio
  return last * Math.pow(prev > 0 ? last / prev : 1, count - table.length);
}

function spinInfo(deg: number): { id: string; name: L10n; points: number } | null {
  if (deg <= 0) return null;
  const exact = getTrick(`spin${deg}`);
  if (exact) return { id: exact.id, name: exact.name, points: exact.points };
  let best: TrickDef | undefined;
  let bestDeg = 0;
  for (const tr of TRICKS) {
    const m = /^spin(\d+)$/.exec(tr.id);
    if (!m) continue;
    const d = Number(m[1]);
    if (d <= deg && d > bestDeg) {
      best = tr;
      bestDeg = d;
    }
  }
  const label = String(deg);
  return {
    id: best?.id ?? `spin${deg}`,
    name: { ru: label, en: label },
    points: (best?.points ?? 0) + ((deg - bestDeg) / 180) * T.spinExtraPer180,
  };
}

const roundSpin = (deg: number): number => Math.round(Math.abs(deg) / 180) * 180;

function grabPoints(id: GrabId, hold: number): number {
  return row(id).points * (1 + T.grabHoldBonus * ramp(hold, 0, T.grabHoldFull));
}

function tierFor(points: number): number {
  let tier = 1;
  for (const limit of T.tiers) if (points >= limit) tier++;
  return Math.min(5, tier);
}

function buildWork(rec: TrickRecord): Work {
  const inverts: Work['inverts'] = [];
  for (const inv of rec.inverts) {
    if (inv.count <= 0) continue;
    const have = inverts.find((x) => x.id === inv.id);
    if (have) have.count += inv.count;
    else inverts.push({ id: inv.id, count: inv.count });
  }
  const flips: Work['flips'] = [];
  for (const f of rec.flips) {
    if (f.count <= 0) continue;
    const have = flips.find((x) => x.id === f.id);
    if (have) have.count += f.count;
    else flips.push({ id: f.id, count: f.count });
  }
  for (const merge of FLIP_MERGES) {
    const a = flips.find((x) => x.id === merge.parts[0]);
    const b = flips.find((x) => x.id === merge.parts[1]);
    if (!a || !b) continue;
    const n = Math.min(a.count, b.count);
    a.count -= n;
    b.count -= n;
    const into = flips.find((x) => x.id === merge.into);
    if (into) into.count += n;
    else flips.push({ id: merge.into, count: n });
  }
  const grabs: Work['grabs'] = [];
  for (const g of rec.grabs) {
    const have = grabs.find((x) => x.id === g.id);
    if (have) have.hold += Math.max(0, g.hold);
    else grabs.push({ id: g.id, hold: Math.max(0, g.hold) });
  }
  return { spin: roundSpin(rec.spinDeg), inverts, flips: flips.filter((f) => f.count > 0), grabs };
}

function comboMatches(req: Requires, w: Work, rec: TrickRecord): boolean {
  if (req.takeoff !== undefined && rec.takeoff !== req.takeoff) return false;
  if (req.spin !== undefined && w.spin !== req.spin) return false;
  if (req.invert !== undefined) {
    const inv = w.inverts.find((x) => x.id === req.invert);
    if (!inv || inv.count !== (req.invertCount ?? 1)) return false;
  }
  if (req.grab !== undefined) {
    if (!w.grabs.some((g) => g.id === req.grab)) return false;
  } else if (req.anyGrab && w.grabs.length === 0) return false;
  if (req.flip !== undefined && !w.flips.some((f) => f.id === req.flip)) return false;
  return true;
}

/** Removes what the combination claims from `w`; returns the extra points earned by a consumed grab's hold time. */
function consume(req: Requires, w: Work): number {
  let holdExtra = 0;
  if (req.spin !== undefined) w.spin = 0;
  if (req.invert !== undefined) w.inverts = w.inverts.filter((x) => x.id !== req.invert);
  if (req.grab !== undefined || req.anyGrab) {
    const idx = req.grab !== undefined ? w.grabs.findIndex((g) => g.id === req.grab) : 0;
    const g = w.grabs[idx];
    if (g) {
      holdExtra = grabPoints(g.id, g.hold) - row(g.id).points;
      w.grabs.splice(idx, 1);
    }
  }
  if (req.flip !== undefined) w.flips = w.flips.filter((f) => f.id !== req.flip);
  return holdExtra;
}

function finish(id: string, ids: Set<string>, name: L10n, parts: TrickPart[], elements: number): ResolvedTrick {
  let points = 0;
  for (const p of parts) {
    p.points = Math.round(p.points);
    points += p.points;
  }
  ids.delete(id);
  return { id, ids: [id, ...ids], name, points, parts, tier: tierFor(points), elements: Math.min(MAX_ELEMENTS, elements) };
}

// ─────────────────────────────────────────────────────────────────── air ──

function resolveAir(rec: TrickRecord): ResolvedTrick {
  const full = buildWork(rec);
  const w: Work = { spin: full.spin, inverts: full.inverts.slice(), flips: full.flips.slice(), grabs: full.grabs.slice() };
  // a bigspin already contains its body 180 — do not pay / name that half turn twice
  const big = full.flips.find((f) => f.id === 'bigspin');
  if (big) w.spin = Math.max(0, w.spin - 180 * big.count);
  const hasInvert = full.inverts.length > 0;
  const ids = new Set<string>();
  const core: TrickPart[] = [];
  const slots: Record<'spin' | 'invert' | 'flip' | 'grab', L10n[]> = { spin: [], invert: [], flip: [], grab: [] };
  let elements = 0;

  // 1. named combinations, most specific first; each one claims its components
  let comboId = '';
  for (const c of COMBOS) {
    if (!comboMatches(c.req, w, rec)) continue;
    const extra = consume(c.req, w);
    core.push({ id: c.def.id, name: c.def.name, points: c.def.points + extra });
    slots[c.req.invert !== undefined ? 'invert' : c.req.flip !== undefined ? 'flip' : c.req.spin !== undefined ? 'spin' : 'grab'].push(c.def.name);
    elements += Math.max(1, c.weight - (c.req.takeoff !== undefined ? 1 : 0));
    ids.add(c.def.id);
    comboId ||= c.def.id;
  }
  // every combination the WHOLE record satisfies counts for goals (raley + 360 + grab is a 313 and a Hoochie Glide)
  for (const c of COMBOS) if (comboMatches(c.req, full, rec)) ids.add(c.def.id);

  // 2. whatever is left, as plain components
  let invertId = '';
  for (const inv of w.inverts) {
    const def = row(inv.id);
    const name = countedName(def, inv.count);
    core.push({ id: inv.id, name, points: def.points * countFactor(T.invertCount, inv.count) });
    slots.invert.push(name);
    elements++;
    invertId ||= inv.id;
  }
  for (const inv of full.inverts) ids.add(inv.id);

  let flipId = '';
  let flipPts = -1;
  for (const f of w.flips) {
    const def = row(f.id);
    const name = countedName(def, f.count);
    const pts = def.points * countFactor(T.flipCount, f.count);
    core.push({ id: f.id, name, points: pts });
    slots.flip.push(name);
    elements++;
    if (pts > flipPts) {
      flipPts = pts;
      flipId = f.id;
    }
  }
  for (const f of rec.flips) if (f.count > 0) ids.add(f.id);
  for (const f of full.flips) ids.add(f.id);

  const spinAll = spinInfo(full.spin);
  if (spinAll) ids.add(spinAll.id);
  const spinLeft = spinInfo(w.spin);
  if (spinLeft) {
    core.push({ id: spinLeft.id, name: spinLeft.name, points: spinLeft.points });
    if (!hasInvert && rec.spinDir) slots.spin.push(rec.spinDir === 'fs' ? W.fs : W.bs);
    slots.spin.push(spinLeft.name);
    elements++;
  }

  if (rec.boneless) {
    const def = row('boneless');
    core.push({ id: def.id, name: def.name, points: def.points });
    ids.add(def.id);
    elements++;
  }

  if (rec.shifty) {
    const def = row('shifty');
    core.push({ id: def.id, name: def.name, points: def.points });
    ids.add(def.id);
    elements++;
  }

  let grabId = '';
  let grabPts = -1;
  const grabNames: L10n[] = [];
  for (const g of w.grabs) {
    const def = row(g.id);
    core.push({ id: g.id, name: def.name, points: grabPoints(g.id, g.hold) });
    grabNames.push(def.name);
    elements++;
    if (def.points > grabPts) {
      grabPts = def.points;
      grabId = g.id;
    }
  }
  if (grabNames.length) slots.grab.push(joinNames(grabNames, ` ${W.and.en} `));
  for (const g of full.grabs) ids.add(g.id);

  // 3. plain air: no trick at all — a filler worth a few points for the height (or just the gap)
  if (core.length === 0) {
    const def = row(rec.board === 'wakeskate' ? 'ollie' : 'air');
    const parts: TrickPart[] = [{ id: def.id, name: def.name, points: def.points + Math.min(T.airMax, Math.max(0, rec.height) * T.airPerMetre) }];
    ids.add(def.id);
    if (!rec.gap) return finish(def.id, ids, def.name, parts, 0);
    parts.push({ id: 'gap', name: rec.gap.name, points: rec.gap.points });
    return finish('gap', ids, rec.gap.name, parts, 1);
  }

  // 4. bonuses on top of the core
  const parts = core.slice();
  let coreSum = 0;
  for (const p of core) coreSum += p.points;
  const stack = T.stack[Math.min(core.length, T.stack.length - 1)] ?? 0;
  if (stack > 0) parts.push({ id: 'stack', name: W.stack, points: coreSum * stack });
  if (rec.switchTakeoff) {
    parts.push({ id: 'switch', name: row('switch').name, points: coreSum * T.switchTakeoff });
    ids.add('switch');
  }
  if (rec.switchLanding) parts.push({ id: 'switchLanding', name: W.switchLanding, points: coreSum * T.switchLanding });
  const amp = T.heightBonus * ramp(rec.height, T.heightFrom, T.heightFull) + T.airTimeBonus * ramp(rec.airTime, T.airTimeFrom, T.airTimeFull);
  if (amp >= 0.02) {
    parts.push({ id: 'bigAir', name: row('bigAir').name, points: coreSum * amp });
    ids.add('bigAir');
  }
  if (rec.handlePass) {
    const def = row('handlePass');
    parts.push({ id: def.id, name: def.name, points: def.points });
    ids.add(def.id);
  }
  const out = rec.takeoff === 'rail' || rec.takeoff === 'ledge' ? 'popOut' : rec.takeoff === 'wall' ? 'wallOut' : '';
  if (out) {
    const def = row(out);
    parts.push({ id: def.id, name: def.name, points: def.points });
    ids.add(def.id);
  }
  if (rec.gap) {
    parts.push({ id: 'gap', name: rec.gap.name, points: rec.gap.points });
    ids.add('gap');
    elements++;
  }

  // 5. name + headline id (combination > invert > flip > spin > grab > shifty > boneless)
  const tokens: L10n[] = [];
  if (rec.switchTakeoff) tokens.push(W.switch);
  tokens.push(...slots.spin, ...slots.invert);
  if (rec.boneless) tokens.push(row('boneless').name);
  tokens.push(...slots.flip);
  if (rec.shifty) tokens.push(row('shifty').name);
  tokens.push(...slots.grab);
  let name = joinNames(tokens);
  if (rec.gap) name = { ru: `${name.ru} ${W.overGap.ru}`, en: `${name.en} ${W.overGap.en}` };
  const headline = comboId || invertId || flipId || spinLeft?.id || grabId || (rec.shifty ? 'shifty' : 'boneless');
  return finish(headline, ids, name, parts, elements);
}

// ────────────────────────────────────────────────────────── rail / wall ──

function fmtNumber(v: number): L10n {
  const s = v >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString();
  return { ru: s.replace('.', ','), en: s };
}

/** Shared by rail and wall records: optional spin in, switch bonus. Returns the name prefix tokens. */
function approach(rec: TrickRecord, ids: Set<string>, core: TrickPart[]): { prefix: L10n[]; spun: boolean } {
  const prefix: L10n[] = [];
  if (rec.switchTakeoff) prefix.push(W.switch);
  const spin = spinInfo(roundSpin(rec.spinDeg));
  if (spin) {
    core.push({ id: spin.id, name: spin.name, points: spin.points });
    ids.add(spin.id);
    prefix.push(spin.name, W.into);
  }
  return { prefix, spun: !!spin };
}

function switchBonus(rec: TrickRecord, ids: Set<string>, parts: TrickPart[], coreSum: number): void {
  if (!rec.switchTakeoff) return;
  parts.push({ id: 'switch', name: row('switch').name, points: coreSum * T.switchTakeoff });
  ids.add('switch');
}

function resolveRail(rec: TrickRecord): ResolvedTrick {
  const r = rec.rail;
  const stances: RailStance[] = [];
  for (const s of r?.stances ?? []) if (!stances.includes(s)) stances.push(s);
  if (stances.length === 0) stances.push('fifty');
  const distance = Math.max(0, r?.distance ?? 0);
  const ids = new Set<string>();
  const core: TrickPart[] = [];
  const { prefix, spun } = approach(rec, ids, core);

  let headline = '';
  let headlinePts = -1;
  let perMetre = 0;
  const stanceNames: L10n[] = [];
  for (const s of stances) {
    const def = row(`rail.${s}`);
    core.push({ id: def.id, name: def.name, points: def.points });
    ids.add(def.id);
    stanceNames.push(def.name);
    perMetre = Math.max(perMetre, T.railPerMetre[s] ?? 0);
    if (def.points > headlinePts) {
      headlinePts = def.points;
      headline = def.id;
    }
  }
  const kinds: Record<string, number> = T.railKind;
  const metres = fmtNumber(distance);
  core.push({
    id: 'rail.distance',
    name: { ru: `${W.distance.ru} ${metres.ru} ${W.metres.ru}`, en: `${W.distance.en} ${metres.en} ${W.metres.en}` },
    points: distance * perMetre * (kinds[r?.kind ?? 'rail'] ?? 1),
  });

  let coreSum = 0;
  for (const p of core) coreSum += p.points;
  const parts = core.slice();
  const press = T.pressBonus * ramp(r?.pressTime ?? 0, 0, T.pressFull);
  if (press > 0) parts.push({ id: 'rail.press', name: W.press, points: coreSum * press });
  switchBonus(rec, ids, parts, coreSum);
  if (rec.gap) {
    parts.push({ id: 'gap', name: rec.gap.name, points: rec.gap.points });
    ids.add('gap');
  }

  const name = joinNames([...prefix, joinNames(stanceNames, ` ${W.then.en} `)]);
  if (distance >= 0.5) {
    name.ru += ` ${metres.ru} ${W.metres.ru}`;
    name.en += ` ${metres.en} ${W.metres.en}`;
  }
  return finish(headline, ids, name, parts, Math.min(2, stances.length) + (spun ? 1 : 0));
}

function resolveWall(rec: TrickRecord): ResolvedTrick {
  const def = row('wallride');
  const ids = new Set<string>();
  const core: TrickPart[] = [];
  const { prefix, spun } = approach(rec, ids, core);
  core.push({ id: def.id, name: def.name, points: def.points });
  const time = Math.min(T.wallMaxTime, Math.max(0, rec.wall?.time ?? 0));
  if (time > 0) core.push({ id: 'wall.time', name: W.wallTime, points: time * T.wallPerSecond });
  let coreSum = 0;
  for (const p of core) coreSum += p.points;
  const parts = core.slice();
  switchBonus(rec, ids, parts, coreSum);
  return finish(def.id, ids, joinNames([...prefix, def.name]), parts, 1 + (spun ? 1 : 0));
}

function resolveSurface(rec: TrickRecord): ResolvedTrick {
  const def = row('surface180');
  const turns = Math.max(1, Math.round(Math.abs(rec.spinDeg) / 180));
  const name: L10n = turns === 1 ? def.name : { ru: def.name.ru.replace('180', String(turns * 180)), en: def.name.en.replace('180', String(turns * 180)) };
  return finish(def.id, new Set<string>(), name, [{ id: def.id, name, points: def.points * turns }], 1);
}

export function resolveTrick(rec: TrickRecord): ResolvedTrick {
  switch (rec.context) {
    case 'rail':
      return resolveRail(rec);
    case 'wall':
      return resolveWall(rec);
    case 'surface':
      return resolveSurface(rec);
    default:
      return resolveAir(rec);
  }
}
