/**
 * RIDER RIG — procedural, IK-driven rider + board + handle posed purely from RiderSimState.
 *
 * Draw calls: body (skinned, 1) + head (1) + board (1) + handle (1), all sharing two atlas materials.
 * Pipeline per update: Animator (state → target pose) → PoseSprings (smoothing) → Solver (IK → bones).
 */
import {
  Bone,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
  Vector4,
  type BufferGeometry,
} from 'three';
import { createRiderSimState } from '../core/riderState';
import type { BoardKind, IRiderRig, QualityProfile, RiderLook, RiderSimState } from '../types';
import { loadAssetOverride } from '../world/assets';
import { Animator, createDirect, type PreviewPose, type RigInput } from './animator';
import { acquireBodyAtlas, releaseBodyAtlas, type BodyAtlas } from './bodyAtlas';
import { buildBody } from './bodyMesh';
import { acquireBoardTextures, boardSpec, buildBoard, buildBridle, buildHandle, releaseBoardTextures, type BoardSpec } from './boardMesh';
import { buildHead } from './headMesh';
import { addClothDetail } from './clothDetail';
import { createPose, PoseSprings } from './pose';
import { B, BONE_COUNT, outfitKeys, proportionsFor, resolveOutfit, type Outfit, type Proportions } from './rigDef';
import { createSolved, Solver } from './solver';
import type { GearLook } from '../types';

const UP = new Vector3(0, 1, 0);

function bindJoints(P: Proportions): Vector3[] {
  const j: Vector3[] = Array.from({ length: BONE_COUNT }, () => new Vector3());
  j[B.pelvis].set(0, P.pelvisY, 0);
  j[B.spine].set(0, P.spineY, 0);
  j[B.chest].set(0, P.chestY, 0);
  j[B.neck].set(0, P.neckY, 0);
  j[B.head].set(0, P.headY, 0);
  j[B.uarmL].set(P.shoulderHalf, P.shoulderY, 0);
  j[B.larmL].set(P.shoulderHalf, P.shoulderY - P.uarm, 0);
  j[B.handL].set(P.shoulderHalf, P.shoulderY - P.uarm - P.larm, 0);
  j[B.thighL].set(P.hipHalf, P.hipY, 0);
  j[B.shinL].set(P.hipHalf, P.kneeY, 0);
  j[B.footL].set(P.hipHalf, P.ankleY, 0);
  j[B.bootL].copy(j[B.footL]);
  j[B.cuffL].copy(j[B.shinL]);
  for (const [l, r] of [
    [B.uarmL, B.uarmR],
    [B.larmL, B.larmR],
    [B.handL, B.handR],
    [B.thighL, B.thighR],
    [B.shinL, B.shinR],
    [B.footL, B.footR],
    [B.bootL, B.bootR],
    [B.cuffL, B.cuffR],
  ]) {
    j[r].copy(j[l]);
    j[r].x = -j[r].x;
  }
  return j;
}

class RiderRig implements IRiderRig {
  readonly root = new Group();

  private look: RiderLook;
  private board: BoardKind;
  private profile: QualityProfile;
  private outfit: Outfit;
  private P: Proportions;
  private spec: BoardSpec;
  private keys = { atlas: '', body: '', head: '', board: '' };
  private female: boolean | null = null;

  private readonly bones: Bone[] = [];
  private skeleton: Skeleton | null = null;
  private readonly bodyMat: MeshStandardMaterial;
  private readonly boardMat: MeshStandardMaterial;
  private readonly handleMat: MeshStandardMaterial;
  private atlas: BodyAtlas | null = null;
  private boardLook: GearLook | null = null;
  private boardLookKind: BoardKind | null = null;
  private bodyMesh: SkinnedMesh | null = null;
  private headMesh: Mesh | null = null;
  private readonly boardNode = new Group();
  private boardMesh: Mesh | null = null;
  private boardOverride: Object3D | null = null;
  private overrideToken = 0;
  private readonly handleMesh: Mesh;
  private readonly bridleMesh: Mesh;

  private readonly animator: Animator;
  private readonly solver: Solver;
  private readonly springs = new PoseSprings();
  private readonly target = createPose();
  private readonly direct = createDirect();
  private readonly input: RigInput = { handle: new Vector3(), ropeDir: new Vector3(0, 0, 1), holding: true, armReach: 0.5 };
  private readonly solved = createSolved();
  private readonly preview: RiderSimState;
  private started = false;
  private prevMode: RiderSimState['mode'] | null = null;
  private lastAirVy = 0;
  private lastJerk = 0;
  private disposed = false;
  private readonly tmpQ = new Quaternion();
  /** Bind-space heights the fabric shader bunches its folds around: elbow, waist, armpit, knee. */
  private readonly clothJoints = { value: new Vector4() };

  /** Triangle counts of the current build (sandbox / perf checks). */
  readonly stats = { body: 0, head: 0, board: 0, handle: 0 };

  constructor(look: RiderLook, board: BoardKind, profile: QualityProfile) {
    this.look = look;
    this.board = board;
    this.profile = profile;
    this.outfit = resolveOutfit(look);
    this.P = proportionsFor(this.outfit.female);
    this.spec = boardSpec(board);
    this.root.name = 'rider';
    for (let i = 0; i < BONE_COUNT; i++) {
      const bone = new Bone();
      this.bones.push(bone);
      this.root.add(bone);
    }
    this.bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    if (profile.post) addClothDetail(this.bodyMat, this.clothJoints);
    this.boardMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    this.patchBoardFlex();
    this.handleMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const handle = buildHandle();
    this.stats.handle = handle.triangles;
    this.handleMesh = new Mesh(handle.geometry, this.handleMat);
    this.handleMesh.name = 'handle';
    this.handleMesh.frustumCulled = false;
    const bridle = buildBridle();
    this.stats.handle += bridle.triangles;
    this.bridleMesh = new Mesh(bridle.geometry, this.handleMat);
    this.bridleMesh.frustumCulled = false;
    this.handleMesh.add(this.bridleMesh);
    this.root.add(this.boardNode, this.handleMesh);
    this.boardNode.name = 'board';

    this.animator = new Animator(this.P, this.spec);
    this.solver = new Solver(this.P, this.spec);
    this.preview = createRiderSimState(board, look.stance);
    this.rebuild();
    this.setPreviewPose('ride', 0);
  }

  // ───────────────────────────────────────────────────────────── build ──

  private rebuild(): void {
    const o = this.outfit;
    const P = this.P;
    const keys = outfitKeys(o, this.board);
    keys.board += '|' + o.stance;
    const shadows = this.profile.shadows;

    if (this.female !== o.female || !this.skeleton) {
      this.female = o.female;
      this.clothJoints.value.set(P.shoulderY - P.uarm, P.hipY + 0.17 * P.scale, P.shoulderY - 0.07 * P.scale, P.kneeY);
      const joints = bindJoints(P);
      const inverses = joints.map((j) => new Matrix4().makeTranslation(-j.x, -j.y, -j.z));
      this.skeleton?.dispose();
      this.skeleton = new Skeleton(this.bones, inverses);
      this.keys.body = '';
      this.keys.head = '';
    }

    if (keys.atlas !== this.keys.atlas) {
      const next = acquireBodyAtlas(keys.atlas, o, Math.min(4, this.profile.anisotropy));
      if (this.keys.atlas) releaseBodyAtlas(this.keys.atlas);
      this.atlas = next;
      this.bodyMat.map = next.map;
      this.bodyMat.roughnessMap = next.rough;
      this.bodyMat.needsUpdate = true;
      this.keys.atlas = keys.atlas;
    }

    if (keys.body !== this.keys.body) {
      const built = buildBody(o, P, this.board);
      this.stats.body = built.triangles;
      if (this.bodyMesh) {
        this.root.remove(this.bodyMesh);
        this.bodyMesh.geometry.dispose();
      }
      const mesh = new SkinnedMesh(built.geometry, this.bodyMat);
      mesh.name = 'body';
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      this.root.add(mesh);
      mesh.bind(this.skeleton, new Matrix4());
      this.bodyMesh = mesh;
      this.keys.body = keys.body;
    }

    if (keys.head !== this.keys.head) {
      const built = buildHead(o, P);
      this.stats.head = built.triangles;
      if (this.headMesh) {
        this.bones[B.head].remove(this.headMesh);
        this.headMesh.geometry.dispose();
      }
      const mesh = new Mesh(built.geometry, this.bodyMat);
      mesh.name = 'head';
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      this.bones[B.head].add(mesh);
      this.headMesh = mesh;
      this.keys.head = keys.head;
    }

    if (keys.board !== this.keys.board) {
      const look = this.board === 'wakeboard' ? o.wakeboard : o.wakeskate;
      const tex = acquireBoardTextures(this.board, look, Math.min(8, this.profile.anisotropy * 2));
      if (this.boardLook && this.boardLookKind) releaseBoardTextures(this.boardLookKind, this.boardLook);
      this.boardLook = look;
      this.boardLookKind = this.board;
      this.boardMat.map = tex.map;
      this.boardMat.roughnessMap = tex.rough;
      this.boardMat.needsUpdate = true;
      const stance = this.board === 'wakeboard' ? P.stanceWakeboard : P.stanceWakeskate;
      const built = buildBoard(this.spec, look, this.board === 'wakeboard' ? o.bindings : null, stance, o.stance === 'goofy');
      this.stats.board = built.triangles;
      let geometry: BufferGeometry | null = null;
      if (this.boardMesh) {
        geometry = this.boardMesh.geometry;
        this.boardMesh.geometry = built.geometry;
        geometry.dispose();
      } else {
        this.boardMesh = new Mesh(built.geometry, this.boardMat);
        this.boardMesh.name = 'boardMesh';
        this.boardMesh.frustumCulled = false;
        this.boardNode.add(this.boardMesh);
      }
      this.boardMesh.castShadow = shadows;
      const kindChanged = !this.keys.board.startsWith(this.board + '|');
      this.keys.board = keys.board;
      if (kindChanged) this.tryOverride();
    }
    this.handleMesh.castShadow = shadows;
    this.bridleMesh.castShadow = false;
  }

  /** Optional user-supplied GLB replaces the procedural board (see src/world/assets.ts). */
  private tryOverride(): void {
    const token = ++this.overrideToken;
    if (this.boardOverride) {
      this.boardNode.remove(this.boardOverride);
      this.boardOverride = null;
      if (this.boardMesh) this.boardMesh.visible = true;
    }
    void loadAssetOverride('board.' + this.board)
      .then((obj) => {
        if (!obj || this.disposed || token !== this.overrideToken) return;
        obj.traverse((c) => {
          c.castShadow = this.profile.shadows;
        });
        this.boardOverride = obj;
        this.boardNode.add(obj);
        if (this.boardMesh) this.boardMesh.visible = false;
      })
      .catch(() => undefined);
  }

  // ─────────────────────────────────────────────────────────── IRiderRig ──

  setLook(look: RiderLook): void {
    this.look = look;
    this.outfit = resolveOutfit(look);
    const female = this.outfit.female;
    if (female !== this.P.female) {
      this.P = proportionsFor(female);
      this.animator.configure(this.P, this.spec);
      this.solver.configure(this.P, this.spec);
    }
    this.preview.stance = look.stance;
    this.rebuild();
  }

  setBoard(kind: BoardKind): void {
    if (kind === this.board) return;
    this.board = kind;
    this.spec = boardSpec(kind);
    this.preview.board = kind;
    this.animator.configure(this.P, this.spec);
    this.solver.configure(this.P, this.spec);
    this.rebuild();
  }

  /** Board flex (deck bends where it slides): nose curl, tail curl, body sag — board-local metres. */
  private readonly flex = { nose: { value: 0 }, tail: { value: 0 }, body: { value: 0 }, half: { value: 0.7 } };

  private patchBoardFlex(): void {
    const f = this.flex;
    this.boardMat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlexNose = f.nose;
      sh.uniforms.uFlexTail = f.tail;
      sh.uniforms.uFlexBody = f.body;
      sh.uniforms.uFlexHalf = f.half;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uFlexNose;\nuniform float uFlexTail;\nuniform float uFlexBody;\nuniform float uFlexHalf;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float zt = clamp(position.z / uFlexHalf, -1.0, 1.0);
            float n = max(0.0, zt - 0.3) / 0.7;
            float t = max(0.0, -zt - 0.3) / 0.7;
            // ends curl up over the obstacle, the body sags between the feet / ends droop off a centre rail
            transformed.y += uFlexNose * n * n + uFlexTail * t * t - uFlexBody * (1.0 - zt * zt);
          }`,
        );
    };
    this.boardMat.customProgramCacheKey = () => 'wsh-board-flex';
  }

  /** Flex targets from the rail stance; eased so the deck loads and springs back. */
  private updateFlex(state: RiderSimState, dt: number): void {
    const f = this.flex;
    f.half.value = this.spec.length / 2;
    const k = this.spec.kind === 'wakeboard' ? 1 : 0.45; // wood flexes far less than a wakeboard
    let nose = 0;
    let tail = 0;
    let body = 0;
    if (state.mode === 'rail' && state.rail) {
      const st = state.rail.stance;
      if (st === 'noseslide' || st === 'noseblunt' || st === 'nosepress') {
        nose = 0.075;
        body = 0.02;
      } else if (st === 'tailslide' || st === 'tailblunt' || st === 'tailpress') {
        tail = 0.075;
        body = 0.02;
      } else {
        // centre on the rail (50-50, board- / lipslide): the ends droop, the middle is held up
        body = -0.032;
      }
    }
    const a = dt > 0 ? 1 - Math.exp(-dt * 10) : 1;
    f.nose.value += (nose * k - f.nose.value) * a;
    f.tail.value += (tail * k - f.tail.value) * a;
    f.body.value += (body * k - f.body.value) * a;
  }

  update(state: RiderSimState, dt: number): void {
    this.updateFlex(state, dt);
    this.root.position.copy(state.pos);
    this.root.quaternion.setFromAxisAngle(UP, state.boardYaw);
    this.animator.compute(state, this.target, this.direct, this.input, null);
    const snap = !(dt > 0) || !this.started;
    if (snap) this.springs.snap(this.target);
    else {
      this.events(state);
      this.springs.step(this.target, Math.min(dt, 0.1));
    }
    this.started = true;
    this.prevMode = state.mode;
    if (state.mode === 'air') this.lastAirVy = state.vel.y;
    this.lastJerk = state.rope.jerk;
    this.apply();
  }

  /** One-shot spring kicks that the continuous targets cannot express (touchdown, rope snap). */
  private events(state: RiderSimState): void {
    const prev = this.prevMode;
    if (prev === 'air' && (state.mode === 'water' || state.mode === 'slide' || state.mode === 'rail')) {
      const impact = Math.min(6, Math.abs(this.lastAirVy));
      this.springs.impulse('hipY', -0.5 * impact);
      this.springs.impulse('pPitch', 0.45 * impact);
      this.springs.impulse('sBend', 0.3 * impact);
    }
    if (state.rope.jerk > this.lastJerk + 0.5 && state.rope.holding) {
      const j = Math.min(5, state.rope.jerk);
      this.springs.impulse('pRoll', -0.5 * j);
      this.springs.impulse('sBend', 0.35 * j);
    }
  }

  setPreviewPose(pose: PreviewPose, t: number): void {
    const st = this.preview;
    const s = this.P.scale;
    const goofy = this.look.stance === 'goofy';
    st.board = this.board;
    st.stance = this.look.stance;
    st.time = t;
    st.pos.set(0, 0, 0);
    st.vel.set(0, 0, 8);
    st.boardYaw = 0;
    st.heading = 0;
    st.switch = false;
    st.crouch = 0;
    st.lean = 0;
    st.speed = 8;
    st.mode = 'water';
    st.surface = 'water';
    st.surfaceNormal.set(0, 1, 0);
    st.bail = null;
    st.rail = null;
    st.wall = null;
    const air = st.air;
    air.time = 0;
    air.grab = null;
    air.grabBlend = 0;
    air.grabTime = 0;
    air.spin = air.spinTarget = air.roll = air.rollTarget = air.raley = air.shifty = 0;
    air.invert = null;
    air.flip.id = null;
    air.flip.caught = true;
    air.flip.roll = air.flip.yaw = air.flip.pitch = 0;
    const rope = st.rope;
    rope.holding = pose === 'ride' || pose === 'grab';
    rope.taut = rope.holding;
    rope.tension = 0.45;
    rope.dir.set(0, 0, 1);
    rope.anchorPos.set(0, 1.2, 30);
    const side = goofy ? 1 : -1;
    rope.handlePos.set(side * 0.1 * s, 0.98 * s, 0.44 * s);
    if (pose === 'ride') {
      st.lean = 0.28 * Math.sin(t * 0.7);
    } else if (pose === 'grab') {
      st.mode = 'air';
      st.surface = 'air';
      air.time = 0.6;
      air.timeToLand = 0.6;
      air.takeoff = 'kicker';
      air.height = 1.2;
      air.grab = this.board === 'wakeboard' ? 'indy' : null;
      air.grabBlend = 1;
      air.grabTime = 1;
      rope.handlePos.set(side * 0.16 * s, 0.86 * s, 0.4 * s);
      if (this.board === 'wakeskate') air.shifty = 0.5 * Math.sin(t * 0.9);
    } else if (pose === 'stoked') {
      st.mode = 'finished';
      st.speed = 6;
    } else {
      st.mode = 'finished';
      st.speed = 0;
      st.surface = 'concrete';
    }
    this.animator.compute(st, this.target, this.direct, this.input, pose);
    if (pose === 'stoked') this.direct.handleVisible = false;
    this.springs.snap(this.target);
    this.started = false;
    this.prevMode = null;
    this.apply();
  }

  private apply(): void {
    this.solver.solve(this.springs.value, this.direct, this.input, this.solved);
    const out = this.solved;
    for (let i = 0; i < BONE_COUNT; i++) {
      const bone = this.bones[i];
      bone.position.copy(out.pos[i]);
      bone.quaternion.copy(out.quat[i]);
    }
    this.boardNode.position.copy(out.boardPos);
    this.boardNode.quaternion.copy(out.boardQuat);
    this.handleMesh.position.copy(out.handlePos);
    this.handleMesh.quaternion.copy(out.handleQuat);
    this.bridleMesh.scale.z = out.bridleLen;
    this.handleMesh.visible = this.direct.handleVisible;
  }

  getHeadWorldPosition(out: Vector3): Vector3 {
    this.root.updateWorldMatrix(true, false);
    return out.copy(this.solved.headCenter).applyMatrix4(this.root.matrixWorld);
  }

  getChestWorldPosition(out: Vector3): Vector3 {
    this.root.updateWorldMatrix(true, false);
    return out.copy(this.solved.chestCenter).applyMatrix4(this.root.matrixWorld);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.bodyMesh?.geometry.dispose();
    this.headMesh?.geometry.dispose();
    this.boardMesh?.geometry.dispose();
    this.handleMesh.geometry.dispose();
    this.bridleMesh.geometry.dispose();
    this.skeleton?.dispose();
    this.bodyMat.dispose();
    this.boardMat.dispose();
    this.handleMat.dispose();
    if (this.keys.atlas) releaseBodyAtlas(this.keys.atlas);
    if (this.boardLook && this.boardLookKind) releaseBoardTextures(this.boardLookKind, this.boardLook);
    void this.tmpQ;
  }
}

export function createRiderRig(look: RiderLook, board: BoardKind, profile: QualityProfile): IRiderRig {
  return new RiderRig(look, board, profile);
}
