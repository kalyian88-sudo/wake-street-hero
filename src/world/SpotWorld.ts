/**
 * WORLD — builds a spot from pure data (SpotDef) and animates everything in it that is not the
 * rider: ground, obstacles, decor props, winch + crew, rope, letters, line preview, effect triggers.
 * Sky / water / particles come from src/world/env through their interfaces.
 */
import { Group, InstancedMesh, LineSegments, Mesh, Points, Vector3 } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { lineInfo, winchAnchor } from '../data/geometry';
import { i18n, t } from '../i18n/i18n';
import enPart from '../i18n/parts/world.en.json';
import ruPart from '../i18n/parts/world.ru.json';
import type { ISpotWorld, QualityProfile, SpotDef, WinchPointDef, WorldBuildContext } from '../types';
import { hasAssetOverrides, loadAssetOverride } from './assets';
import { InstanceBatcher, StaticBatcher } from './batch';
import type { BuildCtx } from './build';
import { Crowd } from './crowd';
import { createEffects } from './effects';
import { createEnvironment } from './env/Environment';
import { createParticles } from './env/Particles';
import { createWater } from './env/Water';
import { buildGround } from './ground';
import { createLetters } from './letters';
import { createLinePreview } from './linePreview';
import { createDebugOverlay, createStartMarker, createZoneMarker } from './markers';
import { MaterialLibrary } from './materials';
import { createFilmer, createOperator } from './npc';
import { buildObstacle } from './obstacles';
import { createPropContext } from './props/context';
import { getPropBuilder } from './props/registry';
import { createRope } from './rope';
import { Terrain } from './terrain';
import './themes';
import { buildWinchCamp } from './winchCamp';
import { createWinch } from './winch';

i18n.extend('ru', ruPart);
i18n.extend('en', enPart);

/** World label through i18n, falling back to the bundled part while the shell's dictionaries are not loaded. */
function label(key: 'world.start' | 'world.finish' | 'world.rec'): string {
  const s = t(key);
  if (s !== key) return s;
  return (i18n.lang === 'ru' ? ruPart : enPart)[key] ?? enPart[key];
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export async function buildSpotWorld(spot: SpotDef, ctx: WorldBuildContext): Promise<ISpotWorld> {
  let profile = ctx.profile;
  const group = new Group();
  group.name = `spot:${spot.id}`;

  // ── environment (other module) ──
  const env = createEnvironment(spot.env, ctx);
  env.attach(ctx.scene, ctx.renderer);
  const water = createWater(spot.water, env, ctx);
  const particles = createParticles(env, ctx);
  group.add(env.object, water.object, particles.object);

  // ── own content ──
  const own = new Group();
  own.name = 'world';
  const staticGroup = new Group();
  staticGroup.name = 'static';
  const dynamic = new Group();
  dynamic.name = 'dynamic';
  own.add(staticGroup, dynamic);
  group.add(own);

  const lib = new MaterialLibrary(profile, { start: label('world.start'), finish: label('world.finish'), rec: label('world.rec') }, spot.env.waterShallow);
  const terrain = new Terrain(spot);
  const b: BuildCtx = {
    spot,
    profile,
    lib,
    terrain,
    statics: new StaticBatcher(40),
    instances: new InstanceBatcher(80),
    dynamic,
    updaters: [],
    shared: new Map(),
    foam: [],
    mat: (key, opts) => lib.get(key, opts),
  };
  const crowd = new Crowd();

  buildGround(b);
  await tick();
  for (const o of spot.obstacles) buildObstacle(b, o);
  await tick();

  // ── decor ──
  const anyPropOverride = await hasAssetOverrides('prop:');
  const unknown = new Set<string>();
  for (let i = 0; i < spot.props.length; i++) {
    const def = spot.props[i];
    const pc = createPropContext(b, def, i, (s) => crowd.add(s));
    if (anyPropOverride) {
      const model = await loadAssetOverride(`prop:${def.type}`);
      if (model) {
        model.applyMatrix4(pc.matrixAt());
        pc.addObject(model);
        continue;
      }
    }
    const builder = getPropBuilder(def.type);
    if (!builder) {
      unknown.add(def.type);
      continue;
    }
    builder(def, pc);
    if (i % 12 === 11) await tick();
  }
  if (unknown.size) console.warn(`[world] unknown prop types skipped: ${[...unknown].join(', ')}`);

  // ── winch + crew ──
  const winchOverride = await loadAssetOverride('winch');
  const winch = createWinch(b, winchOverride);
  const npcMat = lib.get('flat');
  const operator = createOperator(npcMat);
  operator.group.position.copy(winch.operatorPos);
  operator.setHands(winch.throttleHand.clone().sub(winch.operatorPos), winch.restHand.clone().sub(winch.operatorPos));
  const camp = new Group();
  camp.name = 'winchCamp';
  camp.add(winch.group, operator.group);
  buildWinchCamp(b, camp);
  dynamic.add(camp);

  const filmers = spot.filmerZones.map((zone) => {
    const yaw = Math.atan2(zone.center[0] - zone.pos[0], zone.center[1] - zone.pos[2]);
    const f = createFilmer(npcMat, yaw);
    f.group.position.set(zone.pos[0], zone.pos[1], zone.pos[2]);
    dynamic.add(f.group);
    const marker = createZoneMarker(zone, terrain, lib.get('brand'));
    dynamic.add(marker.group);
    return { zone, filmer: f, marker };
  });

  const startMarker = createStartMarker(b);
  dynamic.add(startMarker.group);
  const rope = createRope(lib.get('rope', { side: 'double' }), terrain);
  rope.mesh.visible = false;
  dynamic.add(rope.mesh);
  const letters = createLetters(spot.letters, lib.get('neon'));
  dynamic.add(letters.group);
  const preview = createLinePreview(spot, terrain);
  dynamic.add(preview.group);
  const debug = createDebugOverlay();
  dynamic.add(debug.group);

  await tick();
  const staticMeshes = b.statics.build(staticGroup);
  const instMeshes = b.instances.build(staticGroup);
  crowd.build(dynamic, profile.detail);
  water.setFoamShapes(b.foam);

  const applyShadows = (p: QualityProfile): void => {
    own.traverse((o) => {
      if (o instanceof Mesh) {
        const ud = o.userData as { cast?: boolean; receive?: boolean };
        if (ud.cast === undefined) ud.cast = o.castShadow;
        if (ud.receive === undefined) ud.receive = o.receiveShadow;
        o.castShadow = p.shadows && !!ud.cast;
        o.receiveShadow = p.shadows && !!ud.receive;
      }
    });
    // runtime decor thinning: instanced sets were added in random order → dropping the tail thins evenly
    const keep = p.detail >= 0.75 ? 1 : 0.62;
    for (const m of instMeshes) {
      const full = m.userData.fullCount as number;
      if (m.userData.thin !== false && full > 6) m.count = Math.max(1, Math.ceil(full * keep));
    }
  };
  applyShadows(profile);

  ctx.scene.add(group);

  const effects = createEffects(spot, ctx.bus, water, particles, {
    cheer(strength, big) {
      crowd.cheer(strength);
      if (big) operator.react('cheer', 1.6 + strength * 1.2);
    },
    bail() {
      crowd.cheer(0.22);
      operator.react('facepalm', 2.6);
    },
  });

  let wp: WinchPointDef = spot.winchPoints[0];
  const anchor = new Vector3();
  const centre = new Vector3();
  const lensTmp = new Vector3();
  let disposed = false;

  const world: ISpotWorld = {
    spot,
    group,
    env,
    water,
    particles,

    setWinchPoint(id) {
      wp = spot.winchPoints.find((w) => w.id === id) ?? spot.winchPoints[0];
      if (!wp) return;
      const li = lineInfo(wp);
      camp.position.set(wp.pos[0], wp.pos[1], wp.pos[2]);
      // the winch looks back along the line, at the rider
      camp.rotation.y = li.yaw + Math.PI;
      camp.updateMatrixWorld(true);
      const a = winchAnchor(wp);
      anchor.set(a[0], a[1], a[2]);
      centre.set((wp.pos[0] + wp.start[0]) / 2, wp.start[1], (wp.pos[2] + wp.start[2]) / 2);
      startMarker.place(wp, terrain.waterLevelNear(wp.start[0], wp.start[2]) ?? wp.start[1]);
      letters.setLine(wp.id);
      preview.setLine(wp);
    },

    setLinePreview(visible) {
      preview.setVisible(visible);
    },

    setLetters(collected) {
      letters.setCollected(collected);
    },

    getFilmerCamera(zoneId, riderPos, outPos, outLook) {
      outLook.set(riderPos.x, riderPos.y + 0.9, riderPos.z);
      const f = zoneId ? filmers.find((x) => x.zone.id === zoneId) : undefined;
      if (f) {
        f.filmer.group.updateMatrixWorld(true);
        f.filmer.lensWorld(outPos);
        return;
      }
      // virtual filmer: beside the line, a little ahead, preferably on a quay with the sun behind the lens
      const li = wp ? lineInfo(wp) : { dx: 0, dz: 1, yaw: 0, length: 1 };
      let best = -Infinity;
      for (const side of [-1, 1]) {
        for (const dist of [7, 10]) {
          const x = Math.min(spot.bounds.max[0] - 1, Math.max(spot.bounds.min[0] + 1, riderPos.x + li.dz * side * dist + li.dx * 4.5));
          const z = Math.min(spot.bounds.max[1] - 1, Math.max(spot.bounds.min[1] + 1, riderPos.z - li.dx * side * dist + li.dz * 4.5));
          const h = terrain.heightAt(x, z);
          const dry = !terrain.isOpenWater(x, z);
          const sun = (x - riderPos.x) * env.sunDirection.x + (z - riderPos.z) * env.sunDirection.z > 0 ? 0.5 : 0;
          const score = (dry ? 1 : 0) + sun - dist * 0.01;
          if (score > best) {
            best = score;
            outPos.set(x, h + (dry ? 1.55 : 1.1), z);
          }
        }
      }
    },

    update(dt, time, view) {
      if (disposed) return;
      const s = view.rider;
      env.update(dt, s ? s.pos : centre, view.camera);
      const wake = effects.update(dt, s);
      water.update(dt, time, view.camera, wake);
      particles.update(dt, view.camera);

      const running = !!s && s.mode !== 'finished';
      const tension = s ? s.rope.tension : 0;
      winch.update(dt, time, s ? s.rope.reelSpeed : 0, tension, running);
      operator.update(dt, time, tension);
      for (const f of filmers) {
        const inZone = !!s && Math.hypot(s.pos.x - f.zone.center[0], s.pos.z - f.zone.center[1]) < f.zone.radius;
        f.filmer.update(dt, time, s ? s.pos : null);
        f.marker.update(dt, time, view.camera, inZone);
      }
      crowd.update(dt, time);
      rope.mesh.visible = !!s;
      if (s) rope.update(anchor, s.rope.handlePos, s.rope.slack, s.rope.holding ? tension : 0, time, view.camera);
      letters.update(dt, time);
      preview.update(dt, time);
      startMarker.update(dt, time);
      const ups = b.updaters;
      for (let i = 0; i < ups.length; i++) ups[i](dt, time);
      void lensTmp;
    },

    setDebug(on, shapes) {
      debug.set(on, shapes);
    },

    setProfile(p) {
      profile = p;
      b.profile = p;
      lib.setProfile(p);
      env.setProfile(p);
      water.setProfile(p);
      particles.setProfile(p);
      applyShadows(p);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      effects.dispose();
      ctx.scene.remove(group);
      letters.dispose();
      preview.dispose();
      debug.dispose();
      startMarker.dispose();
      rope.dispose();
      crowd.dispose();
      for (const f of filmers) f.marker.dispose();
      const seen = new Set<BufferGeometry>();
      own.traverse((o: Object3D) => {
        if (o instanceof Mesh || o instanceof Points || o instanceof LineSegments) {
          const g = o.geometry as BufferGeometry;
          if (!seen.has(g)) {
            seen.add(g);
            g.dispose();
          }
          if (o instanceof InstancedMesh) o.dispose();
        }
      });
      lib.dispose();
      water.dispose();
      particles.dispose();
      env.dispose();
      b.updaters.length = 0;
    },
  };

  world.setWinchPoint(wp ? wp.id : '');
  void staticMeshes;
  return world;
}
