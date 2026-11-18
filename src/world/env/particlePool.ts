/**
 * GPU-stateless particle pool: every particle is one instanced quad whose whole life is described by
 * its spawn data (position, velocity, birth, life, look). The vertex shader integrates gravity + drag
 * analytically from `uTime`, so the CPU only writes when something is spawned — nothing per frame.
 */
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  NormalBlending,
  ShaderMaterial,
  Sphere,
  UniformsLib,
  UniformsUtils,
  Float32BufferAttribute,
  Vector3,
  type IUniform,
} from 'three';

/** Floats per particle: pos+birth, vel+life, size0/size1/gravity/drag, alpha/streak/soft/tint, floor/bright. */
export const PARTICLE_STRIDE = 18;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute vec4 iA;   // spawn position, birth time
attribute vec4 iB;   // spawn velocity, life
attribute vec4 iC;   // start size, end size, gravity scale, drag
attribute vec4 iD;   // alpha, streak seconds, softness (0 droplet … 1 puff), tint (0 water … 1 dust)
attribute vec2 iE;   // floor height (dies below), brightness
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunLight;
uniform vec3 uAmbient;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec3 vUv;    // quad uv (-1..1) + length/width aspect
varying vec4 vColor;
varying float vSoft;

void main() {
	float t = uTime - iA.w;
	float k = t / iB.w;
	float drag = iC.w;
	float tau = drag > 0.001 ? ( 1.0 - exp( - drag * t ) ) / drag : t;
	float g = 9.81 * iC.z;
	vec3 pos = iA.xyz + iB.xyz * tau;
	pos.y -= 0.5 * g * t * tau;
	if ( t < 0.0 || k >= 1.0 || pos.y < iE.x ) {
		gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
		vUv = vec3( 0.0, 0.0, 1.0 );
		vColor = vec4( 0.0 );
		vSoft = 0.0;
		return;
	}
	vec3 vel = iB.xyz * exp( - drag * t );
	vel.y -= g * tau;

	float size = mix( iC.x, iC.y, sqrt( k ) );
	vec4 mvPosition = viewMatrix * vec4( pos, 1.0 );
	vec2 vv = ( viewMatrix * vec4( vel, 0.0 ) ).xy;
	float sp = length( vv );
	vec2 dir = sp > 0.001 ? vv / sp : vec2( 0.0, 1.0 );
	float len = size + iD.y * sp;
	mvPosition.xy += dir * ( position.y * len ) + vec2( - dir.y, dir.x ) * ( position.x * size );
	gl_Position = projectionMatrix * mvPosition;
	vUv = vec3( position.xy, len / size );
	vSoft = iD.z;

	#ifdef PARTICLES_ADDITIVE
		// hot metal cooling down: white-yellow → orange → deep red
		vec3 hot = mix( vec3( 1.0, 0.8, 0.42 ), vec3( 1.0, 0.24, 0.03 ), smoothstep( 0.0, 0.75, k ) );
		vColor = vec4( hot * iE.y, iD.x * ( 1.0 - k * k ) );
	#else
		float fade = smoothstep( 0.0, 0.06, k ) * ( 1.0 - smoothstep( 0.5, 1.0, k ) );
		// droplets flare up when the sun is behind them
		float back = pow( max( dot( normalize( pos - cameraPosition ), uSunDir ), 0.0 ), 6.0 );
		vec3 light = uAmbient * 1.15 + uSunLight * ( 0.3 + 1.5 * back * ( 1.0 - iD.z ) );
		// drops right in front of the lens would read as big rings: fade them out up close
		float near = smoothstep( 1.2, 3.5, - mvPosition.z );
		vColor = vec4( mix( uColorA, uColorB, iD.w ) * light * iE.y, iD.x * fade * mix( 1.0, near, 1.0 - iD.z ) );
	#endif
	#include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec3 vUv;
varying vec4 vColor;
varying float vSoft;
#include <common>
#include <fog_pars_fragment>

void main() {
	// capsule: round caps, straight body when velocity-stretched
	float along = max( abs( vUv.y ) * vUv.z - ( vUv.z - 1.0 ), 0.0 );
	float d = length( vec2( vUv.x, along ) );
	float crisp = 1.0 - smoothstep( 0.5, 1.0, d );
	float puff = exp( - d * d * 3.4 ) * ( 1.0 - smoothstep( 0.72, 1.0, d ) );
	float a = mix( crisp, puff, vSoft ) * vColor.a;
	if ( a < 0.004 ) discard;
	vec3 col = vColor.rgb;
	#ifndef PARTICLES_ADDITIVE
		// droplets read as little lenses (the key-art look): see-through middle, darker rim, a hard
		// specular dot up-left; puffs (vSoft → 1) stay soft
		float lens = ( 1.0 - vSoft ) * step( vUv.z, 1.6 );
		float rim = smoothstep( 0.45, 0.95, d );
		float spec = smoothstep( 0.32, 0.05, length( vec2( vUv.x + 0.32, vUv.y * vUv.z - 0.34 ) ) );
		col = mix( col, mix( col * 1.12, col * 0.72, rim ) + vec3( 1.6, 1.5, 1.35 ) * spec * max( 0.6, dot( col, vec3( 0.333 ) ) ), lens );
		a *= mix( 1.0, mix( 0.5, 1.0, rim ) + spec * 0.5, lens );
	#endif
	gl_FragColor = vec4( col, min( a, 1.0 ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

export class ParticlePool {
  readonly mesh: Mesh;
  readonly uniforms: Record<string, IUniform>;
  readonly capacity: number;
  /** Pool clock value after which nothing is alive. */
  aliveUntil = -1;
  private readonly data: Float32Array;
  private readonly buffer: InstancedInterleavedBuffer;
  private readonly geometry: InstancedBufferGeometry;
  private readonly material: ShaderMaterial;
  private cursor = 0;
  private pendingStart = 0;
  private pendingCount = 0;
  /** The previous upload request has been consumed by a render. */
  private uploaded = true;
  private readonly rangeA = { start: 0, count: 0 };
  private readonly rangeB = { start: 0, count: 0 };

  constructor(capacity: number, additive: boolean) {
    this.capacity = Math.max(16, Math.floor(capacity));
    this.data = new Float32Array(this.capacity * PARTICLE_STRIDE);
    // birth = +∞ → every slot starts dead
    for (let i = 0; i < this.capacity; i++) {
      this.data[i * PARTICLE_STRIDE + 3] = 1e9;
      this.data[i * PARTICLE_STRIDE + 7] = 1;
    }
    this.buffer = new InstancedInterleavedBuffer(this.data, PARTICLE_STRIDE, 1);
    this.buffer.setUsage(DynamicDrawUsage);
    const g = (this.geometry = new InstancedBufferGeometry());
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    g.setAttribute('iA', new InterleavedBufferAttribute(this.buffer, 4, 0));
    g.setAttribute('iB', new InterleavedBufferAttribute(this.buffer, 4, 4));
    g.setAttribute('iC', new InterleavedBufferAttribute(this.buffer, 4, 8));
    g.setAttribute('iD', new InterleavedBufferAttribute(this.buffer, 4, 12));
    g.setAttribute('iE', new InterleavedBufferAttribute(this.buffer, 2, 16));
    g.instanceCount = this.capacity;
    g.boundingSphere = new Sphere(new Vector3(), 1e6);

    this.uniforms = {
      ...UniformsUtils.merge([UniformsLib.fog]),
      uTime: { value: 0 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunLight: { value: new Color(1, 1, 1) },
      uAmbient: { value: new Color(0.5, 0.5, 0.5) },
      uColorA: { value: new Color(0.9, 0.96, 1) },
      uColorB: { value: new Color(0.62, 0.58, 0.52) },
    };
    this.material = new ShaderMaterial({
      name: additive ? 'WshSparks' : 'WshSpray',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: additive ? { PARTICLES_ADDITIVE: '' } : {},
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      fog: !additive,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.name = additive ? 'fx.sparks' : 'fx.spray';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    this.mesh.visible = false;
    this.mesh.onAfterRender = () => {
      this.uploaded = true;
    };
  }

  /** Spawn one particle (ring buffer: the oldest slot is recycled). `now` = pool clock. */
  emit(
    now: number,
    px: number,
    py: number,
    pz: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size0: number,
    size1: number,
    gravity: number,
    drag: number,
    alpha: number,
    streak: number,
    soft: number,
    tint: number,
    floor: number,
    bright: number,
  ): void {
    const d = this.data;
    const o = this.cursor * PARTICLE_STRIDE;
    d[o] = px;
    d[o + 1] = py;
    d[o + 2] = pz;
    d[o + 3] = now;
    d[o + 4] = vx;
    d[o + 5] = vy;
    d[o + 6] = vz;
    d[o + 7] = life;
    d[o + 8] = size0;
    d[o + 9] = size1;
    d[o + 10] = gravity;
    d[o + 11] = drag;
    d[o + 12] = alpha;
    d[o + 13] = streak;
    d[o + 14] = soft;
    d[o + 15] = tint;
    d[o + 16] = floor;
    d[o + 17] = bright;
    if (this.pendingCount === 0) this.pendingStart = this.cursor;
    this.pendingCount++;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (now + life > this.aliveUntil) this.aliveUntil = now + life;
  }

  /** Once per frame: push what was spawned to the GPU (sub-range uploads), toggle visibility. */
  flush(now: number): void {
    this.uniforms.uTime.value = now;
    this.mesh.visible = now < this.aliveUntil;
    if (this.pendingCount === 0) return;
    const buf = this.buffer;
    const cap = this.capacity;
    if (!this.uploaded || this.pendingCount >= cap) {
      // an earlier request was never rendered (hidden) or the ring lapped itself → send everything
      buf.clearUpdateRanges();
    } else {
      const firstLen = Math.min(this.pendingCount, cap - this.pendingStart);
      this.rangeA.start = this.pendingStart * PARTICLE_STRIDE;
      this.rangeA.count = firstLen * PARTICLE_STRIDE;
      buf.clearUpdateRanges();
      buf.updateRanges.push(this.rangeA);
      if (firstLen < this.pendingCount) {
        this.rangeB.start = 0;
        this.rangeB.count = (this.pendingCount - firstLen) * PARTICLE_STRIDE;
        buf.updateRanges.push(this.rangeB);
      }
    }
    buf.needsUpdate = true;
    this.uploaded = false;
    this.pendingCount = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
