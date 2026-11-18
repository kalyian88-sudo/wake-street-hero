/**
 * Modes without player control: waiting at the start, tumbling after a bail, coasting after the finish.
 */
import type { SimCore } from '../SimCore';
import { gravityAt, SIM, SURFACE } from '../tuning';

/** Sitting in the water at the start. After go() the rope takes its slack up, then the pull begins. */
export function stepWaiting(c: SimCore, dt: number): void {
  const s = c.state;
  if (!c.going) {
    c.rope.takeUp(0);
    s.rope.reelSpeed = 0;
    return;
  }
  if (c.rope.takeUp(dt)) {
    c.rope.startPull(SIM.reelRamp);
    s.mode = s.surface === 'water' ? 'water' : 'slide';
    if (c.bankSide !== 0 && s.mode === 'slide') {
      // street start: hop off the bank straight into the canal (on the ground the rope would only
      // drag the board along the quay edge)
      const yaw = c.lineYaw + c.bankSide * 0.75;
      c.boardDir = yaw;
      s.heading = s.boardYaw = yaw;
      s.vel.set(Math.sin(yaw) * 4.2, 0, Math.cos(yaw) * 4.2);
      s.speed = 4.2;
      c.noGrindT = 1.2;
      c.takeoff('drop', undefined, 2.3);
    }
  }
}

/** Fall, skip and stop; then back on the board (or the run ends). */
export function stepBail(c: SimCore, dt: number): void {
  const s = c.state;
  const b = s.bail;
  if (!b) {
    s.mode = 'water';
    return;
  }
  b.time += dt;
  b.respawnIn -= dt;
  settle(c, dt, 1);
  if (b.respawnIn <= 0) c.respawn();
}

/** Run over: the winch stops, the rider lets the speed run out. */
export function stepFinished(c: SimCore, dt: number): void {
  settle(c, dt, 0.7);
  const s = c.state;
  s.lean *= Math.max(0, 1 - 4 * dt);
  c.yawSlip = 0;
}

/** Passive body: gravity down to the surface, heavy drag, stops at solids. */
function settle(c: SimCore, dt: number, dragScale: number): void {
  const s = c.state;
  const v = s.vel;
  c.rope.update(dt, 0, s.surfaceY);
  const smp = c.world.sampleInto(c.smp, s.pos.x, s.pos.z, s.pos.y + 0.05, 0.25);
  let grounded = s.pos.y <= smp.y + 1e-3;
  if (!grounded) {
    v.y -= gravityAt(v.y) * dt;
    s.pos.y += v.y * dt;
    if (s.pos.y <= smp.y) grounded = true;
  }
  if (grounded) {
    s.pos.y = smp.y;
    v.y = 0;
  }
  const sp = Math.hypot(v.x, v.z);
  if (sp > 1e-4) {
    const dec = grounded ? (smp.kind === 'water' ? 6 + 0.7 * sp : 2 + 1.6 * SURFACE[smp.kind].friction) * dragScale : 0.4;
    const ns = Math.max(0, sp - dec * dt);
    v.x *= ns / sp;
    v.z *= ns / sp;
  }
  c.moveXZ(dt, s.pos.y, 0.25, false);
  // never drift out of the spot while lying in the water
  const out = c.world.outOfBounds(s.pos.x, s.pos.z, c.v2);
  if (out > 0) {
    s.pos.x += c.v2.x * out;
    s.pos.z += c.v2.z * out;
    v.x = v.z = 0;
  }
  const from = s.surface;
  s.surface = grounded ? smp.kind : 'air';
  s.surfaceY = smp.y;
  s.surfaceNormal.set(0, 1, 0);
  if (grounded && from === 'air' && s.mode === 'bail') c.bus.emit('sim:surface', { from, to: smp.kind });
}
