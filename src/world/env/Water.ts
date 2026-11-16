// STUB — replaced by the env/fx agent. Keep the export name/signature.
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { makeStub } from '../../dev/stub';
import { footprintBounds } from '../../data/geometry';
import type { IEnvironment, IWater, WaterRegionDef, WorldBuildContext } from '../../types';

export function createWater(regions: WaterRegionDef[], env: IEnvironment, _ctx: WorldBuildContext): IWater {
  const object = new Group();
  for (const r of regions) {
    const [minX, minZ, maxX, maxZ] = footprintBounds(r.shape);
    const m = new Mesh(new PlaneGeometry(maxX - minX, maxZ - minZ), new MeshStandardMaterial({ color: env.def.waterShallow, roughness: 0.15 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((minX + maxX) / 2, r.level, (minZ + maxZ) / 2);
    object.add(m);
  }
  return makeStub<IWater>({ object });
}
