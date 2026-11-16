import { describe, it } from 'vitest';
import { phuketOldTown } from '../../src/data/spots/phuket_oldtown';
import { createSimHarness, type SimHarness } from '../../src/physics/simTestKit';
import { createAutopilot } from '../../src/physics/autopilot';
import { RoutePlan } from '../../src/physics/autopilot/plan';
import { createCollisionWorld } from '../../src/physics/CollisionWorld';
import { BOARD, statMods } from '../../src/physics/tuning';
import { NEUTRAL_STATS } from '../../src/config';

const ev = (h: SimHarness) => h.events.filter((e) => !['sim:surface', 'sim:handle', 'trick:spin', 'trick:invert', 'trick:grab','trick:flip','trick:shifty','sim:railStance', 'score:bank'].includes(e.type)).map((e) => `${e.type.replace('sim:','').replace('score:trick','')}@${e.time.toFixed(1)}${e.type === 'sim:bail' ? ':' + (e.payload as any).reason : ''}${e.type === 'trick:catch' ? ':' + (e.payload as any).quality.toFixed(2) : ''}${e.type === 'sim:land' ? ':' + (e.payload as any).quality+':'+(e.payload as any).onto : ''}${e.type === 'sim:railEnter' || e.type==='sim:wallEnter' ? ':' + (e.payload as any).obstacleId : ''}${e.type === 'score:trick' ? '' + (e.payload as any).trick.name.en + '=' + (e.payload as any).awarded : ''}`).join(' | ');

describe('explore', () => {
  it('plan', () => {
    for (const winchId of ['main', 'left', 'right']) {
      const wp = phuketOldTown.winchPoints.find((w) => w.id === winchId)!;
      const plan = new RoutePlan(phuketOldTown, wp, createCollisionWorld(phuketOldTown), BOARD.wakeboard, statMods(NEUTRAL_STATS), 9.5);
      console.log('PLAN', winchId, plan.features.map((f) => `\n   ${f.id} ${f.kind} sIn=${f.sIn.toFixed(1)} lat=${f.latIn.toFixed(1)} sOut=${f.sOut.toFixed(1)} latOut=${f.latOut.toFixed(1)} top=${f.top.toFixed(2)} val=${f.value.toFixed(1)} after=${f.after.toFixed(1)} mid=${f.midJoin} pop=${f.pop ? f.pop.charge.toFixed(2) + '/' + f.pop.dist.toFixed(1) : '-'}`).join(''));
    }
  });
  it('autopilot left trace', () => {
    const h = createSimHarness({ spot: phuketOldTown, winchId: 'left' });
    const bot = createAutopilot(h.sim, { tricks: false });
    for (let i = 0; i < 60 * 90 && h.sim.state.mode !== 'finished'; i++) {
      const inp = bot.update();
      const s = h.sim.state;
      if (s.pos.z > 112 && i % 3 === 0) console.log(`TR t=${s.time.toFixed(2)} ${s.mode} tgt=${bot.targetId} pos=(${s.pos.x.toFixed(2)},${s.pos.y.toFixed(2)},${s.pos.z.toFixed(2)}) v=(${s.vel.x.toFixed(1)},${s.vel.y.toFixed(1)},${s.vel.z.toFixed(1)}) steer=${inp.steer.toFixed(2)} jump=${inp.jump.down} crouch=${s.crouch.toFixed(2)}`);
      h.sim.step(1 / 60, inp, 1);
    }
    console.log('   ', ev(h));
  });
});
