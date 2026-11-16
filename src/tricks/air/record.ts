/**
 * Builders for the TrickRecords the sim hands to resolveTrick().
 */
import type { BoardKind, RailStance, Stance, TrickRecord } from '../../types';

/**
 * Frontside / backside from the rotation direction (+1 = left / +yaw), the stance and whether the
 * rider took off switch. Regular rider spinning left opens the chest towards the travel direction
 * first = frontside; goofy and switch each flip it.
 */
export function spinDirection(dir: number, stance: Stance, switched: boolean): 'fs' | 'bs' | null {
  if (dir === 0) return null;
  let front = dir > 0;
  if (stance === 'goofy') front = !front;
  if (switched) front = !front;
  return front ? 'fs' : 'bs';
}

export function emptyRecord(board: BoardKind, context: TrickRecord['context']): TrickRecord {
  return {
    board,
    context,
    spinDeg: 0,
    spinDir: null,
    inverts: [],
    grabs: [],
    flips: [],
    shifty: false,
    handlePass: false,
    switchTakeoff: false,
    switchLanding: false,
    airTime: 0,
    height: 0,
  };
}

/** Surface 180 on the water. */
export function surfaceSpinRecord(board: BoardKind, dir: 1 | -1, stance: Stance, wasSwitch: boolean): TrickRecord {
  const rec = emptyRecord(board, 'surface');
  rec.spinDeg = 180 * dir;
  rec.spinDir = spinDirection(dir, stance, wasSwitch);
  rec.switchTakeoff = wasSwitch;
  rec.switchLanding = !wasSwitch;
  return rec;
}

export function railRecord(
  board: BoardKind,
  obstacleId: string,
  kind: 'rail' | 'ledge' | 'pipe' | 'handrail',
  stances: RailStance[],
  distance: number,
  pressTime: number,
  isSwitch: boolean,
): TrickRecord {
  const rec = emptyRecord(board, 'rail');
  rec.rail = { obstacleId, kind, stances: stances.slice(), distance, pressTime };
  rec.obstacleId = obstacleId;
  rec.switchTakeoff = isSwitch;
  rec.switchLanding = isSwitch;
  return rec;
}

export function wallRecord(board: BoardKind, obstacleId: string, time: number, isSwitch: boolean): TrickRecord {
  const rec = emptyRecord(board, 'wall');
  rec.wall = { time };
  rec.obstacleId = obstacleId;
  rec.switchTakeoff = isSwitch;
  rec.switchLanding = isSwitch;
  return rec;
}

/** Does an air record contain anything worth scoring? */
export function hasElements(rec: TrickRecord): boolean {
  return (
    rec.spinDeg !== 0 ||
    rec.inverts.length > 0 ||
    rec.grabs.length > 0 ||
    rec.flips.length > 0 ||
    rec.shifty ||
    rec.gap !== undefined ||
    rec.boneless === true
  );
}
