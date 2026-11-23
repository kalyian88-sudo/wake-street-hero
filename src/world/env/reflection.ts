/**
 * Planar reflection of the spot in the water (houses, boats, the rider, the winch) — the single biggest
 * "it looks like a video" cue. Mirrors the camera about the water plane (y = level) and renders the
 * scene into a small half-float target with an oblique near plane, so nothing under the water leaks in
 * (same maths as three/examples Reflector). Quality decides the size and how often it refreshes.
 */
import { HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Matrix4, PerspectiveCamera, Plane, Vector3, Vector4, WebGLRenderTarget } from 'three';
import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import type { QualityProfile } from '../../types';

const _normal = new Vector3(0, 1, 0);
const _planePoint = new Vector3();
const _camPos = new Vector3();
const _view = new Vector3();
const _look = new Vector3();
const _target = new Vector3();
const _rot = new Matrix4();
const _plane = new Plane();
const _clip = new Vector4();
const _q = new Vector4();

export class PlanarReflection {
  readonly target: WebGLRenderTarget;
  /** World → reflection texture (projective). */
  readonly matrix = new Matrix4();
  private readonly cam = new PerspectiveCamera();
  private scale = 0;
  private every = 1;
  /** Reflection draw distance (m): near houses matter, far chunks are culled to save draw calls. */
  private far = 1000;
  private frame = 0;
  private rendering = false;
  enabled = false;
  /** Mip level the water samples: about the same blur on screen whatever the target size. */
  blurLod = 1.5;

  constructor(private level: number) {
    this.target = new WebGLRenderTarget(16, 16, {
      type: HalfFloatType,
      // mip chain = free blur: the water samples a coarse level for soft, footage-like reflections
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
    });
    this.target.texture.name = 'water.reflection';
  }

  setProfile(p: QualityProfile): void {
    // high: half resolution every frame · medium: a third, every second frame · low: off
    this.enabled = p.waterDetail >= 1;
    this.scale = p.waterDetail >= 2 ? 0.5 : 0.34;
    this.every = p.waterDetail >= 2 ? 1 : 2;
    this.far = p.waterDetail >= 2 ? 260 : 110;
    this.blurLod = p.waterDetail >= 2 ? 2.1 : 1.6;
  }

  /** Render the mirrored scene. `hide` = objects that must not appear in their own reflection (the water). */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, hide: Object3D): void {
    if (!this.enabled || this.rendering || !(camera instanceof PerspectiveCamera)) return;
    if (this.frame++ % this.every !== 0) return;
    // size follows the drawing buffer
    const w = Math.max(64, Math.round(renderer.domElement.width * this.scale));
    const h = Math.max(64, Math.round(renderer.domElement.height * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    _planePoint.set(0, this.level, 0);
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    if (_camPos.y < this.level + 0.05) return; // camera under / at the water: nothing to mirror
    _view.subVectors(_planePoint, _camPos).reflect(_normal).negate().add(_planePoint);
    _view.x = _camPos.x;
    _view.z = _camPos.z;
    _view.y = 2 * this.level - _camPos.y;
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    _target.copy(_look);
    _target.y = 2 * this.level - _look.y;

    const rc = this.cam;
    rc.position.copy(_view);
    rc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    rc.lookAt(_target);
    rc.far = Math.min(camera.far, this.far);
    rc.updateMatrixWorld();
    // same lens as the main camera, but a shorter far plane so distant chunks are culled
    rc.fov = camera.fov;
    rc.aspect = camera.aspect;
    rc.near = camera.near;
    rc.updateProjectionMatrix();
    rc.projectionMatrix.elements[8] *= -1;
    rc.projectionMatrix.elements[12] *= -1;

    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);

    // oblique near plane = the water plane (Lengyel)
    _plane.setFromNormalAndCoplanarPoint(_normal, _planePoint).applyMatrix4(rc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = rc.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + pm[8]) / pm[0], (Math.sign(_clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    pm[2] = _clip.x;
    pm[6] = _clip.y;
    pm[10] = _clip.z + 1 - 0.003;
    pm[14] = _clip.w;

    this.rendering = true;
    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const prevVisible = hide.visible;
    hide.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, rc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
    hide.visible = prevVisible;
    this.rendering = false;
  }

  dispose(): void {
    this.target.dispose();
  }
}
