// STUB — replaced by the world agent. Keep the export name/signature.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { makeStub } from '../dev/stub';
import { winchAnchor } from '../data/geometry';
import type { ISpotWorld, SpotDef, WorldBuildContext } from '../types';
import { createEnvironment } from './env/Environment';
import { createParticles } from './env/Particles';
import { createWater } from './env/Water';

export async function buildSpotWorld(spot: SpotDef, ctx: WorldBuildContext): Promise<ISpotWorld> {
  const group = new Group();
  const env = createEnvironment(spot.env, ctx);
  env.attach(ctx.scene, ctx.renderer);
  const water = createWater(spot.water, env, ctx);
  const particles = createParticles(env, ctx);
  group.add(env.object, water.object, particles.object);
  const mat = new MeshStandardMaterial({ color: 0x8d8f94 });
  for (const g of spot.ground) {
    const bottom = g.bottom ?? g.top - 3;
    const m = new Mesh(new BoxGeometry(g.size[0], g.top - bottom, g.size[1]), mat);
    m.position.set(g.center[0], (g.top + bottom) / 2, g.center[1]);
    m.rotation.y = ((g.rot ?? 0) * Math.PI) / 180;
    group.add(m);
  }
  ctx.scene.add(group);
  let winch = spot.winchPoints[0];
  return makeStub<ISpotWorld>({
    spot,
    group,
    env,
    water,
    particles,
    setWinchPoint(id) {
      winch = spot.winchPoints.find((w) => w.id === id) ?? winch;
    },
    getFilmerCamera(_zone, riderPos, outPos, outLook) {
      outPos.set(riderPos.x + 7, riderPos.y + 1.4, riderPos.z + 4);
      outLook.copy(riderPos).setY(riderPos.y + 1);
    },
    update(dt, _time, view) {
      const focus = view.rider?.pos ?? group.position;
      env.update(dt, focus, view.camera);
      void winchAnchor(winch);
    },
    dispose() {
      ctx.scene.remove(group);
    },
  });
}
