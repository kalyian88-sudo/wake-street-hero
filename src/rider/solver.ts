/**
 * Pose parameters → bone transforms (root space). Analytic two-bone IK for both legs (feet planted on
 * the board / in the bindings) and both arms (handle, grabs, free), a three-segment spine, head look
 * and the board + handle transforms. Works in canonical (regular) space and mirrors for goofy.
 * No allocations per solve.
 */
import { Quaternion, Vector3 } from 'three';
import { clamp, clamp01, IK_MAX_STRETCH, lerp, mirrorQuatX, quatFromYX, quatFromYZ, smoothstep, solveTwoBone } from './ik';
import type { Direct, RigInput } from './animator';
import { HANDLE, type BoardSpec } from './boardMesh';
import type { PoseParams } from './pose';
import { B, BONE_COUNT, type Proportions } from './rigDef';

export interface SolvedRig {
  pos: Vector3[];
  quat: Quaternion[];
  boardPos: Vector3;
  boardQuat: Quaternion;
  handlePos: Vector3;
  handleQuat: Quaternion;
  /** Distance bar → bridle apex (the rope end = the sim's handlePos). */
  bridleLen: number;
  /** Root-space centres for camera / fx queries. */
  headCenter: Vector3;
  chestCenter: Vector3;
}

export function createSolved(): SolvedRig {
  return {
    pos: Array.from({ length: BONE_COUNT }, () => new Vector3()),
    quat: Array.from({ length: BONE_COUNT }, () => new Quaternion()),
    boardPos: new Vector3(),
    boardQuat: new Quaternion(),
    handlePos: new Vector3(),
    handleQuat: new Quaternion(),
    bridleLen: HANDLE.bridle,
    headCenter: new Vector3(),
    chestCenter: new Vector3(),
  };
}

/** Left ↔ right bone swap used when mirroring the canonical pose for a goofy rider. */
const MIRROR: number[] = [];
{
  for (let i = 0; i < BONE_COUNT; i++) MIRROR[i] = i;
  const swap = (a: number, b: number): void => {
    MIRROR[a] = b;
    MIRROR[b] = a;
  };
  swap(B.uarmL, B.uarmR);
  swap(B.larmL, B.larmR);
  swap(B.handL, B.handR);
  swap(B.thighL, B.thighR);
  swap(B.shinL, B.shinR);
  swap(B.footL, B.footR);
  swap(B.bootL, B.bootR);
  swap(B.cuffL, B.cuffR);
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const HALF_PI = Math.PI / 2;

export class Solver {
  // canonical results (regular stance) before the optional mirror
  private readonly cp: Vector3[] = Array.from({ length: BONE_COUNT }, () => new Vector3());
  private readonly cq: Quaternion[] = Array.from({ length: BONE_COUNT }, () => new Quaternion());

  private readonly qN = new Quaternion();
  private readonly qA = new Quaternion();
  private readonly qB = new Quaternion();
  private readonly qC = new Quaternion();
  private readonly phQ = new Quaternion();
  private readonly phP = new Vector3();
  private readonly qBody = new Quaternion();
  private readonly pelvisQ = new Quaternion();
  private readonly pelvisP = new Vector3();
  private readonly qS = new Quaternion();
  private readonly spineQ = new Quaternion();
  private readonly chestQ = new Quaternion();
  private readonly spineP = new Vector3();
  private readonly chestP = new Vector3();
  private readonly headQ = new Quaternion();
  private readonly neckQ = new Quaternion();
  private readonly Fq = new Quaternion();
  private readonly Fp = new Vector3();
  private readonly bQ = new Quaternion();
  private readonly bP = new Vector3();
  private readonly he = new Vector3();
  private readonly axis = new Vector3();
  private readonly ankle = [new Vector3(), new Vector3()];
  private readonly footQ = [new Quaternion(), new Quaternion()];
  private readonly shoulder = [new Vector3(), new Vector3()];
  private readonly hip = [new Vector3(), new Vector3()];
  private readonly cx = new Vector3();
  private readonly cy = new Vector3();
  private readonly cz = new Vector3();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();
  private readonly v4 = new Vector3();
  private readonly v5 = new Vector3();
  private readonly mid = new Vector3();
  private readonly end = new Vector3();
  private readonly pole = new Vector3();
  private readonly fd = new Vector3();
  private readonly pn = new Vector3();
  private readonly q1 = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly ident = new Quaternion();
  private readonly shift = new Vector3();
  private readonly bz = new Vector3();

  constructor(
    private P: Proportions,
    private spec: BoardSpec,
  ) {}

  configure(P: Proportions, spec: BoardSpec): void {
    this.P = P;
    this.spec = spec;
  }

  /** Fq / Fp ← rotation `q` about `pivot` applied on top of the current frame. */
  private pivotRot(q: Quaternion, px: number, py: number, pz: number): void {
    this.Fq.premultiply(q);
    this.Fp.set(this.Fp.x - px, this.Fp.y - py, this.Fp.z - pz).applyQuaternion(q);
    this.Fp.x += px;
    this.Fp.y += py;
    this.Fp.z += pz;
  }

  private chestChain(p: PoseParams, extraTwist: number): void {
    const P = this.P;
    this.qS.setFromAxisAngle(Y, p.sTwist + extraTwist);
    this.qA.setFromAxisAngle(X, p.sBend);
    this.qB.setFromAxisAngle(Z, p.sSide);
    this.qS.multiply(this.qA).multiply(this.qB);
    this.spineQ.copy(this.ident).slerp(this.qS, 0.5).premultiply(this.pelvisQ);
    this.chestQ.copy(this.pelvisQ).multiply(this.qS);
    this.spineP.set(0, P.spineY - P.pelvisY, 0).applyQuaternion(this.pelvisQ).add(this.pelvisP);
    this.chestP.set(0, P.chestY - P.spineY, 0).applyQuaternion(this.spineQ).add(this.spineP);
    // upper-body lean towards the handle (see solve step 8)
    this.spineP.addScaledVector(this.shift, 0.5);
    this.chestP.add(this.shift);
    this.cx.copy(X).applyQuaternion(this.chestQ);
    this.cy.copy(Y).applyQuaternion(this.chestQ);
    this.cz.copy(Z).applyQuaternion(this.chestQ);
    for (let i = 0; i < 2; i++) {
      this.shoulder[i]
        .set((i === 0 ? 1 : -1) * P.shoulderHalf, P.shoulderY - P.chestY, 0)
        .applyQuaternion(this.chestQ)
        .add(this.chestP);
    }
  }

  solve(p: PoseParams, D: Direct, input: RigInput, out: SolvedRig): void {
    const P = this.P;
    const spec = this.spec;
    const s = P.scale;
    const cp = this.cp;
    const cq = this.cq;
    const v1 = this.v1;
    const v2 = this.v2;
    const v3 = this.v3;

    // ── 1. board ("phantom" = where the feet stand) in frame space ──
    v1.set(p.nX, p.nY, p.nZ);
    if (v1.lengthSq() < 1e-6) v1.set(0, 1, 0);
    v1.normalize();
    this.qN.setFromUnitVectors(Y, v1);
    this.qA.setFromAxisAngle(Y, p.bYaw).premultiply(this.qN);
    this.phP.set(0, 0, p.bPivot).applyQuaternion(this.qA);
    this.qB.setFromAxisAngle(X, -p.bPitch);
    this.qC.setFromAxisAngle(Z, p.edge);
    this.phQ.copy(this.qA).multiply(this.qB).multiply(this.qC);
    this.phP.sub(v2.set(0, 0, p.bPivot).applyQuaternion(this.phQ));
    if (p.bZ !== 0) this.phP.add(v2.set(0, 0, p.bZ * s).applyQuaternion(this.qA));

    // ── 2. pelvis in frame space ──
    this.qBody.copy(this.ident).slerp(this.qN, clamp01(p.upMix));
    this.qA.setFromAxisAngle(Z, p.lean);
    this.qBody.multiply(this.qA);
    this.pelvisP.set(p.hipX * s, p.hipY * s, p.hipZ * s).applyQuaternion(this.qBody).add(this.phP);
    this.qA.setFromAxisAngle(Y, -HALF_PI + p.pYaw);
    this.qB.setFromAxisAngle(X, p.pPitch);
    this.qC.setFromAxisAngle(Z, p.pRoll);
    this.pelvisQ.copy(this.qBody).multiply(this.qA).multiply(this.qB).multiply(this.qC);

    // ── 3. frame: invert roll → whole yaw → raley swing → bail tumble → sink ──
    this.Fq.identity();
    this.Fp.set(0, 0, 0);
    if (D.roll !== 0) this.pivotRot(this.q1.setFromAxisAngle(Z, D.roll), 0, 0.56 * s, 0);
    if (p.wYaw !== 0) this.pivotRot(this.q1.setFromAxisAngle(Y, p.wYaw), 0, 0, 0);
    if (Math.abs(p.tPitch) > 1e-5) {
      v1.set(input.ropeDir.z, 0, -input.ropeDir.x); // up × rope
      if (v1.lengthSq() < 1e-6) v1.set(1, 0, 0);
      this.pivotRot(this.q1.setFromAxisAngle(v1.normalize(), p.tPitch), 0, 1.25 * s, 0);
    }
    if (D.tumble !== 0) {
      v1.set(Math.cos(D.tumbleYaw), 0, -Math.sin(D.tumbleYaw)); // up × fall direction
      this.pivotRot(this.q1.setFromAxisAngle(v1, D.tumble), 0, 0.6 * s, 0);
    }
    this.Fp.y += p.sink;
    this.pelvisP.applyQuaternion(this.Fq).add(this.Fp);
    this.pelvisQ.premultiply(this.Fq);
    this.phP.applyQuaternion(this.Fq).add(this.Fp);
    this.phQ.premultiply(this.Fq);

    // ── 4. raley: hang the body from the handle ──
    this.shift.set(0, 0, 0);
    this.chestChain(p, 0);
    if (p.hang > 1e-4) {
      v1.addVectors(this.shoulder[0], this.shoulder[1]).multiplyScalar(0.5);
      v2.copy(input.handle).addScaledVector(input.ropeDir, -(0.25 + 0.55 * s));
      v2.y -= 0.03;
      v2.sub(v1).multiplyScalar(p.hang);
      this.pelvisP.add(v2);
      this.phP.add(v2);
    }

    // ── 5. feet on the phantom board ──
    const stance0 = (spec.kind === 'wakeboard' ? P.stanceWakeboard : P.stanceWakeskate) + p.spread;
    const stance = lerp(stance0, 0.115 * s, p.narrow);
    const ax = lerp(0.23 * P.footLen, 0.02, p.narrow);
    const footY = lerp(spec.footY, 0, p.narrow);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const lift = i === 0 ? p.liftF : p.liftR;
      const z = side * stance;
      this.ankle[i].set(ax, footY + P.ankleY + lift, z).applyQuaternion(this.phQ).add(this.phP);
      const duck = lerp(i === 0 ? spec.duckFront : -spec.duckRear, side * 0.14, p.narrow);
      this.qA.setFromAxisAngle(Y, -HALF_PI + duck);
      this.qB.setFromAxisAngle(X, lift * 1.5);
      this.footQ[i].copy(this.phQ).multiply(this.qA).multiply(this.qB);
    }

    // ── 6. keep both feet reachable: slide the pelvis towards an over-stretched leg ──
    const legLen = (P.thigh + P.shin) * 0.994;
    for (let iter = 0; iter < 3; iter++) {
      v3.set(0, 0, 0);
      for (let i = 0; i < 2; i++) {
        v1.set((i === 0 ? 1 : -1) * P.hipHalf, P.hipY - P.pelvisY, 0)
          .applyQuaternion(this.pelvisQ)
          .add(this.pelvisP);
        v2.subVectors(this.ankle[i], v1);
        const d = v2.length();
        if (d > legLen) v3.addScaledVector(v2, (d - legLen) / d);
      }
      if (v3.lengthSq() < 1e-10) break;
      this.pelvisP.add(v3);
    }
    for (let i = 0; i < 2; i++) {
      this.hip[i]
        .set((i === 0 ? 1 : -1) * P.hipHalf, P.hipY - P.pelvisY, 0)
        .applyQuaternion(this.pelvisQ)
        .add(this.pelvisP);
    }

    // ── 7. the real board (flips / free flight) ──
    this.qA.setFromAxisAngle(Y, D.flipYaw);
    this.qB.setFromAxisAngle(X, D.flipPitch);
    this.qC.setFromAxisAngle(Z, D.flipRoll);
    this.bQ.copy(this.phQ).multiply(this.qA).multiply(this.qB).multiply(this.qC);
    this.bP.set(0, p.bY, 0).applyQuaternion(this.phQ).add(this.phP);
    if (D.flipRoll !== 0 || D.flipPitch !== 0) {
      // rotate about the middle of the board's thickness, not its base
      v1.set(0, 0.012, 0);
      v2.copy(v1).applyQuaternion(this.phQ);
      v1.applyQuaternion(this.bQ);
      this.bP.add(v2).sub(v1);
    }
    if (p.bFree > 1e-4) {
      const f = clamp01(p.bFree);
      this.qA.setFromAxisAngle(Y, p.bfYaw);
      this.qB.setFromAxisAngle(X, p.bfPitch);
      this.qC.setFromAxisAngle(Z, p.bfRoll);
      this.q1.copy(this.qA).multiply(this.qB).multiply(this.qC);
      this.bQ.slerp(this.q1, f);
      this.bP.lerp(v1.set(p.bfX, p.bfY, p.bfZ), f);
    }

    // ── 8. spine, shoulders, handle reach ──
    const holdW = Math.max(p.hF, p.hR);
    const armLen = (P.uarm + P.larm) * IK_MAX_STRETCH;
    const gripReach = armLen + 0.06 * s;
    this.chestChain(p, 0);
    // The sim's handlePos is the rope end = the apex of the V-bridle. The bar sits a bridle length
    // back along the rope, slid to where the arms are comfortably long, dropped towards belly height
    // when the body is tucked, pulled into reach and pushed out of the torso.
    const rd = input.ropeDir;
    const apex = input.handle;
    const hw = clamp01(holdW);
    const he = this.he;
    v1.addVectors(this.shoulder[0], this.shoulder[1]).multiplyScalar(0.5);
    v2.subVectors(apex, v1);
    const t0 = v2.dot(rd);
    const perp2 = v2.lengthSq() - t0 * t0;
    const want = input.armReach * s;
    let lam = want * want > perp2 ? t0 - Math.sqrt(want * want - perp2) : t0;
    lam = lerp(HANDLE.bridle, clamp(lam, 0.2, 0.5), hw);
    he.copy(apex).addScaledVector(rd, -lam);
    if (hw > 0) {
      const upright = Math.max(0, this.cy.y) * (1 - clamp01(p.hang));
      const belly = this.pelvisP.y + 0.24 * s;
      he.y -= clamp(he.y - belly, 0, 0.2) * hw * upright;
      v3.copy(he);
      v2.subVectors(he, v1);
      const dh = v2.length();
      const maxD = gripReach + 0.1 * s;
      if (dh > maxD) he.copy(v1).addScaledVector(v2, maxD / dh);
      v2.subVectors(he, this.chestP);
      const along = v2.dot(this.cy);
      v2.addScaledVector(this.cy, -along);
      const rad = v2.length();
      const minR = 0.2 * s;
      if (rad < minR && along < 0.3 * s && along > -0.55 * s) {
        if (rad < 1e-4) v2.copy(this.cz);
        else v2.multiplyScalar(1 / rad);
        he.addScaledVector(v2, minR - rad);
      }
      he.lerp(v3, 1 - hw);
    }
    // bridle: bar → apex
    const bz = this.bz.subVectors(apex, he);
    let bl = bz.length();
    if (bl < 0.06) {
      bz.copy(rd);
      bl = 0.06;
    } else bz.multiplyScalar(1 / bl);
    out.bridleLen = bl;

    // bar axis: perpendicular to the bridle, front hand on the heel side when riding side-on
    v1.copy(this.cx);
    v2.set(1, 0, 0).applyQuaternion(this.Fq);
    v1.addScaledVector(v2, 0.6);
    v1.lerp(v2.set(bz.z, 0, -bz.x), 1 - hw); // loose handle lies flat across the rope
    v1.addScaledVector(bz, -v1.dot(bz));
    if (v1.lengthSq() < 1e-5) v1.set(bz.z, 0, -bz.x);
    if (v1.lengthSq() < 1e-5) v1.set(1, 0, 0);
    this.axis.copy(v1).normalize();

    // twist / lean the upper body so the hands can actually get there
    let extraTwist = 0;
    for (let iter = 0; iter < 2; iter++) {
      let dTwist = 0;
      this.v4.set(0, 0, 0);
      for (let i = 0; i < 2; i++) {
        const w = i === 0 ? p.hF : p.hR;
        if (w < 1e-3) continue;
        v1.copy(he).addScaledVector(this.axis, (i === 0 ? 1 : -1) * HANDLE.grip);
        v2.subVectors(v1, this.shoulder[i]);
        const d = v2.length();
        const excess = d - gripReach * 0.97;
        if (excess <= 0) continue;
        v2.multiplyScalar(1 / d);
        v3.subVectors(this.shoulder[i], this.chestP);
        const grad = v2.dot(this.v5.crossVectors(this.cy, v3)); // d(reach)/d(twist) sign
        dTwist += clamp(excess * 4.5, 0, 0.8) * w * Math.sign(grad) * Math.min(1, Math.abs(grad) * 12);
        this.v4.addScaledVector(v2, clamp(excess * 0.6, 0, 0.09) * w);
      }
      if (dTwist === 0 && this.v4.lengthSq() === 0) break;
      extraTwist = clamp(extraTwist + dTwist, -1.0, 1.0);
      this.shift.add(this.v4).clampLength(0, 0.1 * s);
      this.chestChain(p, extraTwist);
    }

    // ── 9. core bones ──
    cp[B.pelvis].copy(this.pelvisP);
    cq[B.pelvis].copy(this.pelvisQ);
    cp[B.spine].copy(this.spineP);
    cq[B.spine].copy(this.spineQ);
    cp[B.chest].copy(this.chestP);
    cq[B.chest].copy(this.chestQ);

    // head: yaw / pitch relative to the chest, neck takes half
    this.qA.setFromAxisAngle(Y, clamp(p.hdYaw - extraTwist * 0.8, -1.4, 1.4));
    this.qB.setFromAxisAngle(X, -p.hdPitch);
    this.qC.setFromAxisAngle(Z, p.hdRoll);
    this.headQ.copy(this.chestQ).multiply(this.qA).multiply(this.qB).multiply(this.qC);
    this.neckQ.copy(this.chestQ).slerp(this.headQ, 0.45);
    cp[B.neck].set(0, P.neckY - P.chestY, 0).applyQuaternion(this.chestQ).add(this.chestP);
    cq[B.neck].copy(this.neckQ);
    cp[B.head].set(0, P.headY - P.neckY, 0).applyQuaternion(this.neckQ).add(cp[B.neck]);
    cq[B.head].copy(this.headQ);
    out.headCenter.set(0, P.headCenterY - P.headY, 0).applyQuaternion(this.headQ).add(cp[B.head]);
    out.chestCenter.set(0, 0.08 * s, 0).applyQuaternion(this.chestQ).add(this.chestP);

    // ── 10. legs ──
    const px = v3.copy(X).applyQuaternion(this.pelvisQ);
    for (let i = 0; i < 2; i++) {
      const sideSign = i === 0 ? 1 : -1;
      const pole = this.pole;
      pole.copy(Z).applyQuaternion(this.footQ[i]).multiplyScalar(0.9);
      pole.addScaledVector(v1.copy(Z).applyQuaternion(this.pelvisQ), 0.5);
      pole.addScaledVector(px, sideSign * p.kneeOut * 1.6);
      pole.addScaledVector(v1.copy(Y).applyQuaternion(this.pelvisQ), 0.2);
      solveTwoBone(this.hip[i], this.ankle[i], pole, P.thigh, P.shin, this.mid, this.end);
      const thigh = i === 0 ? B.thighL : B.thighR;
      const shin = i === 0 ? B.shinL : B.shinR;
      const foot = i === 0 ? B.footL : B.footR;
      cp[thigh].copy(this.hip[i]);
      quatFromYZ(cq[thigh], v1.subVectors(this.hip[i], this.mid), pole);
      cp[shin].copy(this.mid);
      quatFromYZ(cq[shin], v1.subVectors(this.mid, this.end), pole);
      cp[foot].copy(this.end);
      cq[foot].copy(this.footQ[i]);
      // boots: on the feet, or parked in the bindings of a free board
      const boot = i === 0 ? B.bootL : B.bootR;
      const cuff = i === 0 ? B.cuffL : B.cuffR;
      if (D.bootsOnBoard) {
        const st = spec.kind === 'wakeboard' ? P.stanceWakeboard : P.stanceWakeskate;
        this.qA.setFromAxisAngle(Y, -HALF_PI + (i === 0 ? spec.duckFront : -spec.duckRear));
        cq[boot].copy(this.bQ).multiply(this.qA);
        cp[boot].set(0.23 * P.footLen, spec.footY + P.ankleY, sideSign * st).applyQuaternion(this.bQ).add(this.bP);
        cq[cuff].copy(cq[boot]).multiply(this.qB.setFromAxisAngle(X, 0.16));
        cp[cuff].set(0, P.shin, 0).applyQuaternion(cq[cuff]).add(cp[boot]);
      } else {
        cp[boot].copy(cp[foot]);
        cq[boot].copy(cq[foot]);
        cp[cuff].copy(cp[shin]);
        cq[cuff].copy(cq[shin]);
      }
    }

    // ── 11. arms ──
    this.q2.copy(this.chestQ).invert();
    for (let i = 0; i < 2; i++) {
      const left = i === 0;
      const sideSign = left ? 1 : -1;
      const wH = clamp01(left ? p.hF : p.hR);
      const wG = clamp01(left ? p.gF : p.gR);
      const sh = this.shoulder[i];
      const tgt = this.v4;
      const fd = this.fd;
      const pn = this.pn;
      // free hand
      tgt.set(sideSign * (left ? p.fFx : p.fRx) * s, (left ? p.fFy : p.fRy) * s, (left ? p.fFz : p.fRz) * s)
        .applyQuaternion(this.chestQ)
        .add(this.chestP);
      fd.subVectors(tgt, sh);
      fd.y -= 0.12;
      fd.normalize();
      pn.subVectors(this.chestP, tgt).addScaledVector(this.cz, -0.25);
      pn.y -= 0.1;
      if (wH > 0) {
        // on the bar: fingers wrap it, overhand
        v1.copy(he).addScaledVector(this.axis, sideSign * HANDLE.grip);
        this.gripFrame(v1, sh, this.axis, v2.set(0, -1, 0).addScaledVector(v3.subVectors(v1, this.chestP).setY(0).normalize(), -0.6), this.v5, v3);
        tgt.lerp(v1, wH);
        fd.lerp(this.v5, wH);
        pn.lerp(v3, wH);
      }
      if (wG > 0) {
        // on the board: fingers under the edge, palm towards the board centre
        v1.set(p.gpX, p.gpY, p.gpZ).applyQuaternion(this.bQ).add(this.bP);
        const edgeAxis = v2.copy(p.gAcross > 0.5 ? X : Z).applyQuaternion(this.bQ);
        const toCentre = this.mid.subVectors(this.bP, v1).addScaledVector(this.end.copy(Y).applyQuaternion(this.bQ), 0.08);
        this.gripFrame(v1, sh, edgeAxis, toCentre, this.v5, v3);
        tgt.lerp(v1, wG);
        fd.lerp(this.v5, wG);
        pn.lerp(v3, wG);
      }
      fd.normalize();
      pn.addScaledVector(fd, -pn.dot(fd));
      if (pn.lengthSq() < 1e-8) pn.copy(this.cz).multiplyScalar(-1).addScaledVector(fd, this.cz.dot(fd));
      pn.normalize();
      const hand = left ? B.handL : B.handR;
      quatFromYX(cq[hand], v1.copy(fd).multiplyScalar(-1), v2.copy(pn).multiplyScalar(left ? -1 : 1));
      // wrist = grip point − hand offset
      const wrist = v1.copy(tgt).addScaledVector(fd, -0.093 * s).addScaledVector(pn, -0.033);
      // elbow pole: down / out in front, out / back when the hand is behind the body, out when overhead
      v2.subVectors(wrist, sh).applyQuaternion(this.q2);
      const pole = this.pole;
      pole.copy(this.cy).multiplyScalar(-0.75).addScaledVector(this.cz, -0.3).addScaledVector(this.cx, sideSign * 0.55);
      const behind = smoothstep(0.02, -0.2, v2.z);
      if (behind > 0) {
        v3.copy(this.cx).multiplyScalar(sideSign * 0.9).addScaledVector(this.cz, -0.55).addScaledVector(this.cy, -0.12);
        pole.lerp(v3, behind);
      }
      const above = smoothstep(0.0, 0.3 * s, v2.y);
      if (above > 0) {
        v3.copy(this.cx).multiplyScalar(sideSign).addScaledVector(this.cy, -0.3).addScaledVector(this.cz, 0.12);
        pole.lerp(v3, above);
      }
      solveTwoBone(sh, wrist, pole, P.uarm, P.larm, this.mid, this.end);
      const ua = left ? B.uarmL : B.uarmR;
      const la = left ? B.larmL : B.larmR;
      cp[ua].copy(sh);
      quatFromYZ(cq[ua], v2.subVectors(sh, this.mid), v3.copy(pole).multiplyScalar(-1));
      cp[la].copy(this.mid);
      // same hinge frame as the upper arm: the elbow is skinned to both bones, a twist here would pinch it
      quatFromYZ(cq[la], v2.subVectors(this.mid, this.end), v3.copy(pole).multiplyScalar(-1));
      cp[hand].copy(this.end);
    }

    // ── 12. handle ──
    out.handlePos.copy(he);
    // local +X = bar axis, +Z = bridle
    v2.crossVectors(this.bz, this.axis).normalize();
    quatFromYX(out.handleQuat, v2, this.axis);
    out.boardPos.copy(this.bP);
    out.boardQuat.copy(this.bQ);

    // ── 13. output (mirror for goofy) ──
    if (D.mirror) {
      for (let i = 0; i < BONE_COUNT; i++) {
        const j = MIRROR[i];
        out.pos[j].copy(cp[i]);
        out.pos[j].x = -out.pos[j].x;
        mirrorQuatX(out.quat[j].copy(cq[i]));
      }
      out.boardPos.x = -out.boardPos.x;
      mirrorQuatX(out.boardQuat);
      out.handlePos.x = -out.handlePos.x;
      mirrorQuatX(out.handleQuat);
      out.headCenter.x = -out.headCenter.x;
      out.chestCenter.x = -out.chestCenter.x;
    } else {
      for (let i = 0; i < BONE_COUNT; i++) {
        out.pos[i].copy(cp[i]);
        out.quat[i].copy(cq[i]);
      }
    }
  }

  /**
   * Hand frame for gripping a bar / edge running along `axis` at `point`: fingers come from the
   * shoulder perpendicular to the axis, the palm normal is the perpendicular closest to `ref`.
   */
  private gripFrame(point: Vector3, shoulder: Vector3, axis: Vector3, ref: Vector3, outFd: Vector3, outPn: Vector3): void {
    outFd.subVectors(point, shoulder);
    outFd.addScaledVector(axis, -outFd.dot(axis));
    if (outFd.lengthSq() < 1e-8) outFd.set(0, -1, 0).addScaledVector(axis, axis.y);
    outFd.normalize();
    outPn.crossVectors(axis, outFd);
    if (outPn.dot(ref) < 0) outPn.multiplyScalar(-1);
  }
}
