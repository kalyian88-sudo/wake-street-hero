/**
 * Route planning for the autopilot: turns the obstacles of a spot into "features" (kicker, grind line,
 * wall) with an approach axis, decides which ones can be chained from a given position and how much
 * a chain is worth (longest-path over the features sorted along the line).
 */
import { lineInfo } from '../../data/geometry';
import type { KickerDef, SpotDef, WinchPointDef } from '../../types';
import type { CollisionWorld, GrindLine, WallFace } from '../CollisionWorld';
import { apexHeight, fallTime, gravityAt, popSpeed, SIM, type BoardTuning, type StatMods } from '../tuning';

export interface PopPlan {
  /** Charge 0..1 to release with. */
  charge: number;
  /** Release this many metres before the feature's entry point. */
  dist: number;
}

export interface Feature {
  id: string;
  kind: 'kicker' | 'grind' | 'wall';
  /** Entry point and unit travel axis (world XZ). */
  ex: number;
  ez: number;
  ax: number;
  az: number;
  /** Rideable length along the axis. */
  len: number;
  /** Entry / exit as (progress along the line, offset to the left of it), metres. */
  sIn: number;
  latIn: number;
  sEnd: number;
  latEnd: number;
  /** Where the rider is back on the surface afterwards. */
  sOut: number;
  latOut: number;
  /** Grind: line height above the water at the entry. */
  top: number;
  /** Can be joined part-way along (low rails, walls). */
  midJoin: boolean;
  value: number;
  /** Best total value of what can still be chained after this feature. */
  after: number;
  /** Aim this far to the side of the axis (walls: slightly behind the face). */
  bias: number;
  ramp: KickerDef | null;
  line: GrindLine | null;
  wall: WallFace | null;
  pop: PopPlan | null;
}

/** Metres of forward travel needed per metre of sideways correction, plus a straight run-in. */
const SIDE_RATIO = 2;
const RUN_IN = 2;

export class RoutePlan {
  readonly features: Feature[] = [];
  readonly sx: number;
  readonly sz: number;
  readonly dx: number;
  readonly dz: number;
  readonly length: number;

  constructor(spot: SpotDef, wp: WinchPointDef, world: CollisionWorld, tune: BoardTuning, mods: StatMods, speed: number) {
    const line = lineInfo(wp);
    this.sx = wp.start[0];
    this.sz = wp.start[2];
    this.dx = line.dx;
    this.dz = line.dz;
    this.length = line.length;
    const waterY = wp.start[1];

    for (const ramp of world.ramps) {
      const def = ramp.def;
      const ax = ramp.sin;
      const az = ramp.cos;
      if (ax * this.dx + az * this.dz < 0.6) continue;
      // boosted flight: lip speed from the slope + a full pop saved for the lip
      const lipX = ramp.ox + ax * ramp.length;
      const lipZ = ramp.oz + az * ramp.length;
      const slope = (ramp.height / ramp.length) * (1 + ramp.curve);
      const vy = speed * slope + popSpeed(tune, 1) * mods.pop * SIM.lipBoost;
      const flight = speed * fallTime(ramp.height, vy) + 1.5;
      let value = 3.8;
      // a gap footprint under the flight path makes the kicker worth more
      for (let g = 0; g < world.gaps.length; g++) {
        for (let d = 1; d < flight; d += 0.5) {
          if (world.inGap(g, lipX + ax * d, lipZ + az * d)) {
            value = 8;
            break;
          }
        }
      }
      this.add({
        id: def.id,
        kind: 'kicker',
        ex: ramp.ox,
        ez: ramp.oz,
        ax,
        az,
        len: ramp.length,
        top: ramp.height,
        midJoin: false,
        value,
        bias: 0,
        ramp: def,
        line: null,
        wall: null,
        pop: null,
        flight,
      });
    }

    for (const g of world.grinds) {
      // orient along the line
      const fwd = (g.px[g.n - 1] - g.px[0]) * this.dx + (g.pz[g.n - 1] - g.pz[0]) * this.dz >= 0;
      const i0 = fwd ? 0 : g.n - 1;
      const i1 = fwd ? 1 : g.n - 2;
      const hl = Math.hypot(g.px[i1] - g.px[i0], g.pz[i1] - g.pz[i0]) || 1;
      const ax = (g.px[i1] - g.px[i0]) / hl;
      const az = (g.pz[i1] - g.pz[i0]) / hl;
      if (ax * this.dx + az * this.dz < 0.6) continue;
      const under = world.sample(g.px[i0] - ax * 1.5, g.pz[i0] - az * 1.5, 1e6, 0);
      const top = g.py[i0] - (under.kind === 'water' ? under.y : waterY);
      const slope = (g.py[i1] - g.py[i0]) / hl;
      let pop: PopPlan | null = null;
      if (top > SIM.railAutoHeight - 0.03) {
        pop = planPop(tune, mods, speed, top, slope, hl);
        if (!pop) continue;
      }
      const horizontal = Math.hypot(g.px[g.n - 1] - g.px[0], g.pz[g.n - 1] - g.pz[0]);
      this.add({
        id: g.id,
        kind: 'grind',
        ex: g.px[i0],
        ez: g.pz[i0],
        ax,
        az,
        len: horizontal,
        top,
        midJoin: pop === null && g.n === 2,
        value: (pop ? 2.2 : 1.2) + Math.min(14, g.total) / 6,
        bias: 0,
        ramp: null,
        line: g,
        wall: null,
        pop,
        flight: speed * 0.68,
        endX: g.px[fwd ? g.n - 1 : 0],
        endZ: g.pz[fwd ? g.n - 1 : 0],
      });
    }

    for (const w of world.walls) {
      const fwd = w.dx * this.dx + w.dz * this.dz >= 0;
      const ax = fwd ? w.dx : -w.dx;
      const az = fwd ? w.dz : -w.dz;
      if (ax * this.dx + az * this.dz < 0.6) continue;
      const ex = fwd ? w.ax : w.ax + w.dx * w.len;
      const ez = fwd ? w.az : w.az + w.dz * w.len;
      // which side of the travel axis is the face on? aim a little behind it so the board makes contact
      const left = w.nx * az - w.nz * ax; // normal · leftOf(axis)
      this.add({
        id: w.id,
        kind: 'wall',
        ex,
        ez,
        ax,
        az,
        len: w.len,
        top: 0,
        midJoin: true,
        value: 2.6,
        bias: left > 0 ? -0.35 : 0.35,
        ramp: null,
        line: null,
        wall: w,
        pop: null,
        flight: 2.5,
        sideOut: left > 0 ? 0.8 : -0.8,
      });
    }

    this.features.sort((a, b) => a.sIn - b.sIn);
    // longest path, back to front
    for (let i = this.features.length - 1; i >= 0; i--) {
      const f = this.features[i];
      let best = 0;
      for (let j = i + 1; j < this.features.length; j++) {
        const g = this.features[j];
        if (this.joinAt(f.sOut, f.latOut, g) < 0) continue;
        best = Math.max(best, g.value + g.after);
      }
      f.after = best;
    }
  }

  private add(src: Omit<Feature, 'sIn' | 'latIn' | 'sEnd' | 'latEnd' | 'sOut' | 'latOut' | 'after'> & { flight: number; endX?: number; endZ?: number; sideOut?: number }): void {
    const endX = src.endX ?? src.ex + src.ax * src.len;
    const endZ = src.endZ ?? src.ez + src.az * src.len;
    const outX = endX + src.ax * src.flight;
    const outZ = endZ + src.az * src.flight;
    const f: Feature = {
      id: src.id,
      kind: src.kind,
      ex: src.ex,
      ez: src.ez,
      ax: src.ax,
      az: src.az,
      len: src.len,
      top: src.top,
      midJoin: src.midJoin,
      value: src.value,
      bias: src.bias,
      ramp: src.ramp,
      line: src.line,
      wall: src.wall,
      pop: src.pop,
      sIn: this.along(src.ex, src.ez),
      latIn: this.lateral(src.ex, src.ez),
      sEnd: this.along(endX, endZ),
      latEnd: this.lateral(endX, endZ),
      sOut: this.along(outX, outZ),
      latOut: this.lateral(outX, outZ) + (src.sideOut ?? 0),
      after: 0,
    };
    // only things reasonably near the line and before the finish
    if (Math.abs(f.latIn) > 9 || f.sIn < 4 || f.sIn > this.length - 6) return;
    this.features.push(f);
  }

  along(x: number, z: number): number {
    return (x - this.sx) * this.dx + (z - this.sz) * this.dz;
  }

  /** Offset to the LEFT of the line (left of (dx,dz) is (dz, −dx)). */
  lateral(x: number, z: number): number {
    return (x - this.sx) * this.dz - (z - this.sz) * this.dx;
  }

  /**
   * Progress along the line at which a rider at (s, lat) can be lined up with the feature,
   * or −1 when it cannot be reached. Low rails and walls may be joined part-way.
   */
  joinAt(s: number, lat: number, f: Feature): number {
    const need = RUN_IN + Math.abs(f.latIn + f.bias - lat) * SIDE_RATIO + (f.pop ? f.pop.dist + 3 : 0);
    if (f.sIn - s >= need) return f.sIn;
    if (!f.midJoin) return -1;
    const span = f.sEnd - f.sIn;
    if (span <= 0) return -1;
    let join = s + need;
    // the lateral target moves if the feature is not parallel to the line
    const k = (join - f.sIn) / span;
    const latAt = f.latIn + (f.latEnd - f.latIn) * (k < 0 ? 0 : k > 1 ? 1 : k);
    join = s + RUN_IN + Math.abs(latAt + f.bias - lat) * SIDE_RATIO;
    if (join < f.sIn) join = f.sIn;
    return f.sEnd - join >= Math.min(4, span * 0.6) ? join : -1;
  }

  /** Best feature to go for from (s, lat). `skip` = a feature to ignore. Returns null when nothing is reachable. */
  choose(s: number, lat: number, skip: Feature | null): Feature | null {
    let best: Feature | null = null;
    let bestScore = 0;
    for (let i = 0; i < this.features.length; i++) {
      const f = this.features[i];
      if (f === skip || f.sEnd < s + 1) continue;
      const join = this.joinAt(s, lat, f);
      if (join < 0) continue;
      const span = Math.max(1e-3, f.sEnd - f.sIn);
      const share = f.midJoin ? Math.min(1, (f.sEnd - join) / span) : 1;
      const score = f.value * (0.4 + 0.6 * share) + f.after;
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }
}

/**
 * Pop needed to come down onto a rail whose entry is `top` above the water and climbs at `slope`:
 * the charge and the release distance before the entry point. Null when it is out of reach.
 */
export function planPop(tune: BoardTuning, mods: StatMods, speed: number, top: number, slope: number, firstSeg: number): PopPlan | null {
  const reach = apexHeight(popSpeed(tune, 1) * mods.pop);
  if (reach < top + 0.12) return null;
  // smallest charge that clears the entry with some margin
  let charge = 1;
  for (let c = 0.2; c <= 1.001; c += 0.1) {
    if (apexHeight(popSpeed(tune, c) * mods.pop) >= top + 0.45) {
      charge = c;
      break;
    }
  }
  const vy0 = popSpeed(tune, charge) * mods.pop;
  const dt = 1 / 120;
  let best = -1;
  let bestErr = Infinity;
  // try release distances; pick the one that locks on closest to 0.6 m past the entry
  for (let dist = 0.4; dist <= 9; dist += 0.1) {
    let y = 0;
    let vy = vy0;
    let prevY = 0;
    for (let t = dt; t < 2; t += dt) {
      vy -= gravityAt(vy) * dt;
      prevY = y;
      y += vy * dt;
      const along = speed * t - dist;
      if (y <= 0 && vy < 0) break;
      if (along < 0.15 || along > firstSeg - 0.3 || t < 0.1) continue;
      const railY = top + slope * along;
      const dy = railY - y;
      const rise = vy - speed * slope;
      if (dy >= -SIM.railSnapAbove && dy <= SIM.railSnapBelow && rise <= SIM.railMaxRise - 0.15 && prevY >= railY - SIM.railSnapBelow) {
        const err = Math.abs(along - 0.6);
        if (err < bestErr) {
          bestErr = err;
          best = dist;
        }
        break;
      }
    }
  }
  return best < 0 ? null : { charge, dist: best };
}
