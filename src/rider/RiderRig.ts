// STUB — replaced by the rider agent. Keep the export name/signature.
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { makeStub } from '../dev/stub';
import type { BoardKind, IRiderRig, QualityProfile, RiderLook } from '../types';

export function createRiderRig(_look: RiderLook, _board: BoardKind, _profile: QualityProfile): IRiderRig {
  const root = new Group();
  const body = new Mesh(new CapsuleGeometry(0.22, 1.1, 4, 8), new MeshStandardMaterial({ color: 0xe30613 }));
  body.position.y = 0.95;
  const board = new Mesh(new BoxGeometry(0.42, 0.05, 1.4), new MeshStandardMaterial({ color: 0x222222 }));
  root.add(body, board);
  return makeStub<IRiderRig>({
    root,
    update(state) {
      root.position.copy(state.pos);
      root.rotation.y = state.boardYaw;
    },
    getHeadWorldPosition: (out) => out.copy(root.position).setY(root.position.y + 1.7),
    getChestWorldPosition: (out) => out.copy(root.position).setY(root.position.y + 1.2),
  });
}
