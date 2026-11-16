/**
 * Effect triggers. The env module owns the effects (water, particles); this file decides WHEN they
 * fire: continuous ones from the rider state every frame, one-shots from the event bus.
 */
import { Vector3 } from 'three';
import type { EventBus, P3 } from '../core/events';
import type { IParticles, IWater, ObstacleDef, RiderSimState, SpotDef, WakeSource } from '../types';

type GrindMaterial = 'metal' | 'stone' | 'wood' | 'plastic';

export function grindMaterial(o: ObstacleDef): GrindMaterial {
  if (o.kind === 'rail') {
    switch (o.material ?? (o.style === 'bamboo' ? 'bamboo' : 'steel')) {
      case 'stone':
      case 'concrete':
        return 'stone';
      case 'bamboo':
        return 'wood';
      case 'pvc':
        return 'plastic';
      default:
        return 'metal';
    }
  }
  if (o.kind === 'ledge') {
    if (o.style === 'granite' || o.style === 'marble') return 'stone';
    if (o.style === 'bamboo') return 'wood';
    return 'metal';
  }
  return 'metal';
}

export interface EffectHooks {
  /** Crowd / operator reaction, strength 0..1. */
  cheer(strength: number, big: boolean): void;
  bail(): void;
}

export interface Effects {
  /** Per frame. Returns the wake source for IWater.update (null in menus). */
  update(dt: number, rider: RiderSimState | null): WakeSource | null;
  dispose(): void;
}

export function createEffects(spot: SpotDef, bus: EventBus, water: IWater, particles: IParticles, hooks: EffectHooks): Effects {
  const mats = new Map<string, GrindMaterial>();
  for (const o of spot.obstacles) mats.set(o.id, grindMaterial(o));
  const p = new Vector3();
  const d = new Vector3();
  const up = new Vector3(0, 1, 0);
  const wake: WakeSource = { pos: new Vector3(), vel: new Vector3(), speed: 0, onWater: false, lean: 0 };
  let wet = 0;
  const at = (q: P3): Vector3 => p.set(q.x, q.y, q.z);

  const offs = [
    bus.on('sim:pop', (e) => {
      if (e.surface === 'water') {
        particles.splash(at(e.pos), 0.25 + e.power * 0.5, 'pop');
        water.ripple(p, 0.3 + e.power * 0.3);
      } else particles.dust(at(e.pos), 0.35 + e.power * 0.3, e.surface === 'wetConcrete');
    }),
    bus.on('sim:land', (e) => {
      at(e.pos);
      if (e.onto === 'water' || e.surface === 'water') {
        particles.splash(p, Math.min(1, Math.max(0.15, e.impact / 9)), 'land');
        water.ripple(p, Math.min(1, Math.max(0.2, e.impact / 8)));
      } else if (e.onto === 'rail') {
        particles.sparks(p, up, Math.min(1, 0.3 + e.impact / 8));
      } else particles.dust(p, Math.min(1, Math.max(0.2, e.impact / 7)), e.surface === 'wetConcrete');
    }),
    bus.on('sim:bail', (e) => {
      at(e.pos);
      if (e.surface === 'water') {
        particles.splash(p, 0.7 + e.intensity * 0.3, 'bail');
        water.ripple(p, 1);
        water.ripple(d.copy(p).addScalar(0.4), 0.6);
      } else particles.dust(p, 1, e.surface === 'wetConcrete');
      hooks.bail();
    }),
    bus.on('sim:respawn', (e) => {
      particles.splash(at(e.pos), 0.3, 'drop');
      water.ripple(p, 0.5);
      wet = 0;
    }),
    bus.on('sim:railEnter', (e) => {
      at(e.pos);
      if (e.material === 'metal') particles.sparks(p, up, 1);
      else if (e.material === 'stone') particles.dust(p, 0.6, false);
    }),
    bus.on('letter:collect', (e) => {
      particles.sparks(at(e.pos), up, 0.8);
    }),
    bus.on('score:trick', (e) => {
      const tier = e.trick.tier;
      if (tier >= 2) hooks.cheer(Math.min(1, tier / 5 + (e.landing === 'perfect' ? 0.15 : 0)), tier >= 3);
    }),
    bus.on('sim:finish', () => hooks.cheer(1, true)),
    bus.on('goal:complete', () => hooks.cheer(0.6, false)),
  ];

  return {
    update(dt, s) {
      if (!s) return null;
      wake.pos.copy(s.pos);
      wake.vel.copy(s.vel);
      wake.speed = s.speed;
      wake.lean = s.lean;
      const onWater = (s.mode === 'water' || s.mode === 'waiting') && s.surface === 'water';
      wake.onWater = onWater;
      const fx = Math.sin(s.heading);
      const fz = Math.cos(s.heading);
      if (onWater) {
        wet = 1;
        if (s.speed > 4) {
          const carve = Math.abs(s.lean);
          const amount = Math.min(1, (carve * s.speed) / 11 + Math.max(0, (s.speed - 10) / 16));
          if (amount > 0.06) {
            // rider's right of travel = (−cos θ, 0, sin θ); spray leaves on the outside of the turn
            const side = s.lean >= 0 ? -1 : 1;
            const rx = -fz * side;
            const rz = fx * side;
            p.set(s.pos.x - fx * 0.55 + rx * 0.15, s.pos.y + 0.05, s.pos.z - fz * 0.55 + rz * 0.15);
            d.set(rx * (0.5 + carve) - fx * 0.35, 0.75, rz * (0.5 + carve) - fz * 0.35).normalize();
            particles.spray(p, d, amount);
          }
        }
      } else if (s.mode !== 'bail') {
        if (wet > 0) {
          wet = Math.max(0, wet - dt * 1.1);
          if (wet > 0.05) particles.drips(s.pos, s.vel, wet);
        }
        if (s.rail) {
          const m = mats.get(s.rail.obstacleId) ?? 'metal';
          p.set(s.pos.x, s.pos.y + 0.02, s.pos.z);
          if (m === 'metal') {
            d.copy(s.rail.tangent).multiplyScalar(-1);
            d.y += 0.35;
            particles.sparks(p, d.normalize(), Math.min(1, 0.25 + s.speed / 12));
          } else if (m === 'stone') particles.dust(p, Math.min(0.6, s.speed / 14), false);
        } else if (s.mode === 'slide' && s.speed > 1) {
          p.set(s.pos.x - fx * 0.4, s.pos.y + 0.03, s.pos.z - fz * 0.4);
          particles.dust(p, Math.min(1, s.speed / 9), s.surface === 'wetConcrete' || wet > 0.3);
        } else if (s.mode === 'wall' && s.wall) {
          p.set(s.pos.x, s.pos.y, s.pos.z);
          particles.dust(p, 0.4, wet > 0.3);
        }
      }
      return wake;
    },
    dispose() {
      for (const off of offs) off();
    },
  };
}
