/**
 * Factory + copy helpers for RiderSimState. Headless-safe (three math only).
 * Used by the sim, the replay recorder, the rig sandbox and tests.
 */
import { Vector3 } from 'three';
import type { AirState, BoardKind, FlipState, RiderSimState, RopeState, Stance } from '../types';

function createFlip(): FlipState {
  return { id: null, roll: 0, yaw: 0, pitch: 0, progress: 0, caught: true, catchWindow: 0 };
}

function createAir(): AirState {
  return {
    time: 0,
    height: 0,
    peak: 0,
    takeoff: 'pop',
    takeoffYaw: 0,
    spin: 0,
    spinTarget: 0,
    roll: 0,
    rollTarget: 0,
    invert: null,
    raley: 0,
    shifty: 0,
    grab: null,
    grabBlend: 0,
    grabTime: 0,
    flip: createFlip(),
    handlePass: 0,
    timeToLand: 0,
  };
}

function createRope(): RopeState {
  return {
    holding: true,
    taut: false,
    tension: 0,
    length: 0,
    slack: 0,
    dir: new Vector3(0, 0, 1),
    handlePos: new Vector3(),
    anchorPos: new Vector3(),
    reelSpeed: 0,
    jerk: 0,
  };
}

export function createRiderSimState(board: BoardKind = 'wakeboard', stance: Stance = 'regular'): RiderSimState {
  return {
    mode: 'waiting',
    board,
    stance,
    time: 0,
    pos: new Vector3(),
    vel: new Vector3(),
    speed: 0,
    heading: 0,
    boardYaw: 0,
    switch: false,
    lean: 0,
    crouch: 0,
    surface: 'water',
    surfaceY: 0,
    surfaceNormal: new Vector3(0, 1, 0),
    air: createAir(),
    rail: null,
    wall: null,
    rope: createRope(),
    bail: null,
    progress: 0,
    distToWinch: 0,
    hero: false,
    slowMo: 0,
  };
}

/** Deep copy `src` into `dst` without allocating when the optional sub-objects already exist. */
export function copyRiderSimState(src: RiderSimState, dst: RiderSimState): RiderSimState {
  dst.mode = src.mode;
  dst.board = src.board;
  dst.stance = src.stance;
  dst.time = src.time;
  dst.pos.copy(src.pos);
  dst.vel.copy(src.vel);
  dst.speed = src.speed;
  dst.heading = src.heading;
  dst.boardYaw = src.boardYaw;
  dst.switch = src.switch;
  dst.lean = src.lean;
  dst.crouch = src.crouch;
  dst.surface = src.surface;
  dst.surfaceY = src.surfaceY;
  dst.surfaceNormal.copy(src.surfaceNormal);
  const a = dst.air;
  const sa = src.air;
  const flip = a.flip;
  Object.assign(a, sa);
  a.flip = Object.assign(flip, sa.flip);
  if (src.rail) {
    const t = dst.rail?.tangent ?? new Vector3();
    dst.rail = { ...src.rail, tangent: t.copy(src.rail.tangent) };
  } else dst.rail = null;
  if (src.wall) {
    const n = dst.wall?.normal ?? new Vector3();
    dst.wall = { ...src.wall, normal: n.copy(src.wall.normal) };
  } else dst.wall = null;
  const r = dst.rope;
  const sr = src.rope;
  r.holding = sr.holding;
  r.taut = sr.taut;
  r.tension = sr.tension;
  r.length = sr.length;
  r.slack = sr.slack;
  r.dir.copy(sr.dir);
  r.handlePos.copy(sr.handlePos);
  r.anchorPos.copy(sr.anchorPos);
  r.reelSpeed = sr.reelSpeed;
  r.jerk = sr.jerk;
  dst.bail = src.bail ? { ...src.bail } : null;
  dst.progress = src.progress;
  dst.distToWinch = src.distToWinch;
  dst.hero = src.hero;
  dst.slowMo = src.slowMo;
  return dst;
}

export function cloneRiderSimState(src: RiderSimState): RiderSimState {
  return copyRiderSimState(src, createRiderSimState(src.board, src.stance));
}
