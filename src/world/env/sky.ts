/**
 * Sky dome. Day / golden / sunset / overcast use three's Preetham `Sky`, patched with:
 *   - a one-fetch cloud deck (tileable texture projected on a plane, lit towards the sun),
 *   - horizon haze that fades exactly into scene.fog (so distant geometry dissolves into the sky),
 *   - a dark ground below the horizon,
 *   - in BAKE mode only: no sun disc and a soft generic skyline, so the water and the IBL get
 *     "something standing around" to reflect instead of an empty bright horizon.
 * Night uses its own gradient dome (stars, moon, city glow) with the same extras.
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type IUniform,
  type Texture,
} from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { EnvDef } from '../../types';
import { getCloudTexture } from './textures';

export interface SkyDome {
  readonly mesh: Mesh;
  /** Bake mode: hide the sun / moon disc, show the generic skyline (+ neon at night). */
  setBake(on: boolean): void;
  /** Hide only the sun / moon disc (sky colour probes). */
  setDisc(on: boolean): void;
  /** Seconds — drifts the cloud deck. */
  setTime(t: number): void;
  dispose(): void;
}

interface CloudLook {
  coverage: number;
  scale: number;
  softness: number;
  opacity: number;
  /** uv units per second. */
  drift: number;
}

const CLOUDS: Record<EnvDef['timeOfDay'], CloudLook> = {
  // a few soft fair-weather clouds, like in real riding footage — never a busy painted sky
  day: { coverage: 0.33, scale: 0.28, softness: 0.38, opacity: 0.88, drift: 0.0016 },
  golden: { coverage: 0.31, scale: 0.26, softness: 0.4, opacity: 0.84, drift: 0.0013 },
  sunset: { coverage: 0.36, scale: 0.24, softness: 0.42, opacity: 0.82, drift: 0.0012 },
  overcast: { coverage: 0.99, scale: 0.21, softness: 0.62, opacity: 0.97, drift: 0.002 },
  night: { coverage: 0.42, scale: 0.27, softness: 0.36, opacity: 0.8, drift: 0.0011 },
};

/**
 * three's Preetham sky is tuned to look right as a backdrop at exposure 0.5; in the same linear units as
 * our sun (a sunlit white wall ≈ sunIntensity / π) it is several times too bright, which washes the IBL
 * out and hides every shadow. These gains bring the sky to a believable sun : sky ratio.
 */
const SKY_GAIN: Record<EnvDef['timeOfDay'], number> = { day: 0.3, golden: 0.32, sunset: 0.42, overcast: 0.3, night: 1 };

const SHARED_PARS = /* glsl */ `
uniform sampler2D wshCloudTex;
uniform vec4 wshCloud;        // coverage, uv scale, softness, opacity
uniform vec2 wshCloudDrift;
uniform vec2 wshSunXZ;
uniform vec3 wshCloudLit;
uniform vec3 wshCloudShade;
uniform vec3 wshGround;
uniform vec3 wshHaze;         // density, amount, how much the glow around the sun cuts through
uniform vec4 wshSkyline;      // height (sin elevation), gap share, opacity, neon amount
uniform vec3 wshWallLit;
uniform vec3 wshWallShade;
uniform float wshBake;
uniform float wshGain;        // Preetham radiance → scene units (the raw sky is ~4× too bright for our sun)
uniform vec3 fogColor;
uniform vec4 wshPoster;      // strength, zenith → horizon gradient below
uniform vec3 wshPosterZen;
uniform vec3 wshPosterMid;
uniform vec3 wshPosterHor;

vec3 wshPaint( vec3 col, vec3 dir, float cosSun ) {
	if ( wshPoster.x <= 0.0 ) return col;
	float y = max( dir.y, 0.0 );
	vec3 g = mix( wshPosterHor, wshPosterMid, smoothstep( 0.0, 0.16, y ) );
	g = mix( g, wshPosterZen, smoothstep( 0.14, 0.62, y ) );
	// warmer and brighter towards the sun
	g = mix( g, wshPosterHor * 1.4, pow( max( cosSun, 0.0 ), 6.0 ) * 0.7 );
	float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 painted = g * ( 0.35 + 0.65 * l / max( wshPoster.y, 1e-4 ) );
	return mix( col, painted, wshPoster.x * smoothstep( -0.02, 0.02, dir.y ) );
}

float wshHash1( float n ) { return fract( sin( n * 12.9898 ) * 43758.5453 ); }
float wshHash2( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}

vec3 wshClouds( vec3 col, vec3 dir, float cosSun ) {
	if ( wshCloud.x <= 0.0 || dir.y <= 0.0 ) return col;
	vec2 cuv = dir.xz / ( dir.y + 0.1 ) * wshCloud.y + wshCloudDrift;
	vec4 c = texture2D( wshCloudTex, cuv );
	float wisp = texture2D( wshCloudTex, cuv * 3.1 + vec2( 0.31, 0.67 ) - wshCloudDrift ).a;
	float dens = c.r + ( wisp - 0.5 ) * 0.34;
	float edge = 1.0 - wshCloud.x;
	float m = smoothstep( edge, edge + wshCloud.z, dens ) * smoothstep( 0.0, 0.11, dir.y );
	vec2 grad = c.gb * 2.0 - 1.0;
	float lit = clamp( 0.5 - dot( grad, wshSunXZ ) * 1.5 + ( 1.0 - m ) * 0.4, 0.0, 1.0 );
	vec3 cc = mix( wshCloudShade, wshCloudLit, lit );
	cc += wshCloudLit * pow( max( cosSun, 0.0 ), 10.0 ) * ( 1.0 - m * 0.75 );
	return mix( col, cc, m * wshCloud.w );
}

vec3 wshSurround( vec3 col, vec3 dir ) {
	if ( wshBake > 0.5 ) {
		float az = atan( dir.z, dir.x );
		float h1 = wshHash1( floor( az * 8.276 ) );
		float h2 = wshHash1( floor( az * 21.008 + 2.3 ) + 91.0 );
		float top = wshSkyline.x * ( ( 0.4 + 0.6 * h1 ) * step( wshSkyline.y, h1 ) + 0.22 * h2 );
		float sil = smoothstep( top + 0.012, top - 0.012, dir.y ) * wshSkyline.z;
		float facing = 0.5 - 0.5 * dot( normalize( dir.xz + 1e-5 ), wshSunXZ );
		vec3 wall = wshWallShade + wshWallLit * facing * facing;
		if ( wshSkyline.w > 0.0 ) {
			float slot = az * 9.5493;
			float id = floor( slot );
			float hue = wshHash1( id + 19.0 );
			vec3 neon = hue < 0.34 ? vec3( 1.0, 0.07, 0.16 ) : ( hue < 0.67 ? vec3( 0.08, 0.75, 1.0 ) : vec3( 1.0, 0.5, 0.08 ) );
			float bar = smoothstep( 0.5, 0.28, abs( fract( slot ) - 0.5 ) ) * smoothstep( 0.0, 0.02, dir.y ) * smoothstep( top, top * 0.35, dir.y );
			wall += neon * bar * step( 0.5, wshHash1( id + 7.0 ) ) * wshSkyline.w;
		}
		col = mix( col, wall, sil );
	}
	return mix( col, wshGround, smoothstep( 0.0, - 0.05, dir.y ) );
}

// Applied AFTER tone mapping / output encoding, exactly like three's fog chunk, so it matches scene.fog.
vec3 wshHazeOut( vec3 col, vec3 dir, float cosSun ) {
	float glow = pow( max( cosSun, 0.0 ), 8.0 );
	float haze = exp( - max( dir.y, 0.0 ) * wshHaze.x ) * wshHaze.y * ( 1.0 - wshHaze.z * glow );
	haze *= mix( 1.0, smoothstep( - 0.1, 0.0, dir.y ), wshBake );
	col = mix( col, fogColor, haze );
	#ifdef TONE_MAPPING
		col += ( wshHash2( gl_FragCoord.xy ) - 0.5 ) / 255.0;
	#endif
	return col;
}
`;

const NIGHT_VERT = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
	vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
	vWorldPosition = worldPosition.xyz;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	gl_Position.z = gl_Position.w;
}
`;

const NIGHT_FRAG = /* glsl */ `
varying vec3 vWorldPosition;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uCityGlow;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uStars;
uniform float uDisc;
${SHARED_PARS}

vec3 wshHash3( vec3 p ) {
	p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
	p += dot( p, p.yxz + 33.33 );
	return fract( ( p.xxy + p.yxx ) * p.zyx );
}

void main() {
	vec3 direction = normalize( vWorldPosition - cameraPosition );
	float y = direction.y;
	float cosTheta = dot( direction, uMoonDir );

	vec3 col = mix( uHorizon, uZenith, pow( clamp( y, 0.0, 1.0 ), 0.42 ) );

	// city glow hugging the horizon, lumpy in azimuth
	float az = atan( direction.z, direction.x );
	float lump = 0.62 + 0.38 * sin( az * 2.0 + 0.7 ) * sin( az * 5.0 + 2.1 );
	col += uCityGlow * exp( - max( y, 0.0 ) * 6.5 ) * lump;

	if ( uStars > 0.0 && y > 0.0 ) {
		vec3 p = direction * 120.0;
		vec3 h = wshHash3( floor( p ) );
		float px = length( fwidth( p ) );
		float r = max( 0.07, px * 0.75 );
		float d = length( fract( p ) - ( 0.2 + 0.6 * h ) );
		float star = smoothstep( r, r * 0.25, d ) * step( 0.55, h.x ) * min( 1.0, 0.0049 / ( r * r ) );
		float mag = 0.25 + 5.0 * pow( h.y, 7.0 );
		vec3 tint = mix( vec3( 1.0, 0.86, 0.7 ), vec3( 0.75, 0.86, 1.0 ), h.z );
		col += tint * star * mag * uStars * smoothstep( 0.03, 0.32, y );
	}

	// moon: slightly oversized disc with limb darkening + two halos
	float ang = sqrt( max( 2.0 - 2.0 * cosTheta, 0.0 ) ) / 0.026;
	float disc = smoothstep( 1.0, 0.9, ang ) * uDisc;
	col += uMoonColor * ( disc * ( 1.0 - 0.3 * ang * ang ) * 7.0 + pow( max( cosTheta, 0.0 ), 900.0 ) * 0.5 + pow( max( cosTheta, 0.0 ), 48.0 ) * 0.07 );

	col = wshClouds( col, direction, cosTheta );
	col = wshSurround( col, direction );

	gl_FragColor = vec4( col, 1.0 );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>

	gl_FragColor.rgb = wshHazeOut( gl_FragColor.rgb, direction, cosTheta );
}
`;

function linear(hex: number): Color {
  return new Color(hex);
}

/** Uniforms shared by both domes, derived from the def. */
function sharedUniforms(def: EnvDef, sunDir: Vector3): Record<string, IUniform> {
  const look = CLOUDS[def.timeOfDay];
  const sun = linear(def.sunColor).multiplyScalar(def.sunIntensity);
  const fog = linear(def.fogColor);
  const sinEl = Math.max(0.05, sunDir.y);
  const lit = new Color();
  const shade = new Color();
  const wallShade = new Color();
  const ground = new Color();
  let hazeDensity = 9;
  let hazeAmount = 0.9;
  let skylineHeight = 0.2;
  let neon = 0;
  switch (def.timeOfDay) {
    case 'day':
      lit.copy(sun).multiplyScalar(0.4).add(new Color(0.22, 0.26, 0.34));
      shade.setRGB(0.46, 0.53, 0.68);
      wallShade.setRGB(0.1, 0.12, 0.16);
      break;
    case 'golden':
      lit.copy(sun).multiplyScalar(0.44).add(new Color(0.2, 0.2, 0.24));
      shade.setRGB(0.44, 0.48, 0.6);
      wallShade.setRGB(0.085, 0.08, 0.1);
      break;
    case 'sunset':
      // low sun: clouds lit warm cream / peach, soft blue-grey in their shade (no neon pink)
      lit.copy(sun).multiplyScalar(0.5).add(new Color(0.34, 0.24, 0.2));
      shade.setRGB(0.4, 0.42, 0.56);
      wallShade.setRGB(0.04, 0.035, 0.055);
      hazeDensity = 7;
      break;
    case 'overcast':
      lit.setRGB(0.92, 0.94, 0.97).multiplyScalar(0.55 + 0.35 * def.ambientIntensity);
      shade.setRGB(0.5, 0.53, 0.58).multiplyScalar(0.55 + 0.35 * def.ambientIntensity);
      wallShade.setRGB(0.09, 0.095, 0.105);
      hazeDensity = 4.5;
      hazeAmount = 0.95;
      break;
    case 'night':
      lit.copy(sun).multiplyScalar(0.2).add(new Color(0.03, 0.032, 0.045));
      shade.setRGB(0.014, 0.018, 0.032);
      wallShade.setRGB(0.006, 0.006, 0.01);
      hazeDensity = 8;
      hazeAmount = 0.7;
      skylineHeight = 0.24;
      neon = def.neon ? 1.6 : 0;
      break;
  }
  // Sunlit facades of the generic skyline: albedo/π × sun; ground: dim bounce of sun + sky.
  const wallLit = sun.clone().multiplyScalar(0.085);
  ground
    .copy(sun)
    .multiplyScalar(sinEl * 0.07)
    .add(fog.clone().multiplyScalar(def.timeOfDay === 'night' ? 0.06 : 0.12));
  const sunXZ = new Vector2(sunDir.x, sunDir.z);
  if (sunXZ.lengthSq() < 1e-6) sunXZ.set(0, 1);
  sunXZ.normalize();
  return {
    wshCloudTex: { value: getCloudTexture() as Texture },
    wshCloud: { value: new Vector4(look.coverage, look.scale, look.softness, look.opacity) },
    wshCloudDrift: { value: new Vector2() },
    wshSunXZ: { value: sunXZ },
    wshCloudLit: { value: lit },
    wshCloudShade: { value: shade },
    wshGround: { value: ground },
    wshHaze: { value: new Vector3(hazeDensity, hazeAmount, def.timeOfDay === 'overcast' ? 0 : 0.8) },
    wshSkyline: { value: new Vector4(skylineHeight, 0.28, 0.96, neon) },
    wshWallLit: { value: wallLit },
    wshWallShade: { value: wallShade },
    wshBake: { value: 0 },
    ...posterUniforms(def),
    wshGain: { value: SKY_GAIN[def.timeOfDay] },
    // refreshed by the renderer from scene.fog (material.fog = true) in the right colour space
    fogColor: { value: fog.clone() },
    fogNear: { value: def.fogNear },
    fogFar: { value: def.fogFar },
    fogDensity: { value: 0 },
  };
}

function insert(src: string, anchor: string, code: string, where: 'before' | 'after'): string | null {
  const i = src.indexOf(anchor);
  if (i < 0) return null;
  const at = where === 'before' ? i : i + anchor.length;
  return src.slice(0, at) + code + src.slice(at);
}

/**
 * Low-sun colour correction. Preetham at golden hour / sunset drifts to a heavy violet-magenta that
 * reads as a painting; real footage keeps a soft blue overhead and a pale warm band at the horizon.
 * The physical sky keeps its brightness, part of its colour is pulled to that natural gradient.
 * Day / overcast / night stay untouched.
 */
function posterUniforms(def: EnvDef): Record<string, IUniform> {
  const sunset = def.timeOfDay === 'sunset';
  const on = sunset ? 0.75 : def.timeOfDay === 'golden' ? 0.3 : 0;
  // typical sky radiance (after wshGain) the gradient is normalised to
  const ref = sunset ? 0.9 : 1.4;
  return {
    wshPoster: { value: new Vector4(on, ref, 0, 0) },
    wshPosterZen: { value: sunset ? new Color(0.34, 0.54, 1.0) : new Color(0.4, 0.62, 1.1) },
    wshPosterMid: { value: sunset ? new Color(0.82, 0.84, 0.96) : new Color(0.84, 0.92, 1.08) },
    wshPosterHor: { value: sunset ? new Color(1.45, 1.14, 0.82) : new Color(1.4, 1.3, 1.16) },
  };
}

let warnedPatch = false;

function createDayDome(def: EnvDef, sunDir: Vector3): SkyDome {
  const sky = new Sky();
  const mat = sky.material as ShaderMaterial;
  const u = mat.uniforms;
  u.turbidity.value = def.turbidity;
  u.rayleigh.value = def.rayleigh;
  u.mieCoefficient.value = def.mieCoefficient ?? 0.005;
  u.mieDirectionalG.value = def.mieDirectionalG ?? 0.8;
  (u.sunPosition.value as Vector3).copy(sunDir);
  // three's built-in fbm clouds cost ~20 hashes per sky pixel per frame — ours are one texture.
  if (u.cloudCoverage) u.cloudCoverage.value = 0;
  const wantsDisc = def.timeOfDay !== 'overcast';
  if (u.showSunDisc) u.showSunDisc.value = wantsDisc ? 1 : 0;

  const shared = sharedUniforms(def, sunDir);
  let frag: string | null = mat.fragmentShader;
  frag = insert(frag, 'void main() {', SHARED_PARS + '\n', 'before');
  frag =
    frag &&
    insert(
      frag,
      'gl_FragColor = vec4( texColor, 1.0 );',
      'texColor = wshSurround( wshClouds( wshPaint( texColor * wshGain, direction, cosTheta ), direction, cosTheta ), direction );\n\t\t\t',
      'before',
    );
  frag =
    frag &&
    insert(frag, '#include <colorspace_fragment>', '\n\t\t\tgl_FragColor.rgb = wshHazeOut( gl_FragColor.rgb, direction, cosTheta );', 'after');
  let patched = false;
  if (frag) {
    mat.fragmentShader = frag;
    Object.assign(u, shared);
    mat.fog = true;
    patched = true;
  } else if (!warnedPatch) {
    warnedPatch = true;
    console.warn('[env] three Sky shader changed — clouds / haze / skyline patch skipped');
  }
  mat.needsUpdate = true;
  sky.scale.setScalar(900);
  sky.frustumCulled = false;
  sky.renderOrder = 900; // after the opaque world: only the visible sky pixels get shaded
  sky.matrixAutoUpdate = true;
  sky.name = 'env.sky';
  const look = CLOUDS[def.timeOfDay];
  let discOn = true;
  const applyDisc = (bake: boolean): void => {
    if (u.showSunDisc) u.showSunDisc.value = wantsDisc && discOn && !bake ? 1 : 0;
  };
  return {
    mesh: sky,
    setBake(on) {
      if (patched) u.wshBake.value = on ? 1 : 0;
      applyDisc(on);
    },
    setDisc(on) {
      discOn = on;
      applyDisc(patched ? u.wshBake.value > 0.5 : false);
    },
    setTime(t) {
      if (patched) (u.wshCloudDrift.value as Vector2).set(t * look.drift, t * look.drift * 0.6);
    },
    dispose() {
      sky.geometry.dispose();
      mat.dispose();
    },
  };
}

function createNightDome(def: EnvDef, moonDir: Vector3): SkyDome {
  const fog = linear(def.fogColor);
  const moon = linear(def.sunColor);
  const uniforms: Record<string, IUniform> = {
    ...sharedUniforms(def, moonDir),
    uZenith: { value: new Color(0.008, 0.014, 0.036) },
    uHorizon: { value: fog.clone().multiplyScalar(0.4).add(new Color(0.01, 0.015, 0.032)) },
    uCityGlow: { value: def.neon ? new Color(0.085, 0.032, 0.062) : new Color(0.05, 0.036, 0.026) },
    uMoonDir: { value: moonDir.clone() },
    uMoonColor: { value: moon.multiplyScalar(0.55 + 0.6 * Math.min(1, def.sunIntensity)) },
    uStars: { value: def.stars === false ? 0 : def.stars ? 1 : 0.5 },
    uDisc: { value: 1 },
  };
  const mat = new ShaderMaterial({
    name: 'WshNightSky',
    uniforms,
    vertexShader: NIGHT_VERT,
    fragmentShader: NIGHT_FRAG,
    side: BackSide,
    depthWrite: false,
    fog: true,
  });
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), mat);
  mesh.scale.setScalar(900);
  mesh.frustumCulled = false;
  mesh.renderOrder = 900;
  mesh.name = 'env.nightSky';
  const look = CLOUDS.night;
  let discOn = true;
  let bake = false;
  return {
    mesh,
    setBake(on) {
      bake = on;
      uniforms.wshBake.value = on ? 1 : 0;
      uniforms.uDisc.value = discOn && !bake ? 1 : 0;
    },
    setDisc(on) {
      discOn = on;
      uniforms.uDisc.value = discOn && !bake ? 1 : 0;
    },
    setTime(t) {
      (uniforms.wshCloudDrift.value as Vector2).set(t * look.drift, t * look.drift * 0.6);
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}

/** `sunDir` = unit vector towards the sun (the moon at night). */
export function createSkyDome(def: EnvDef, sunDir: Vector3): SkyDome {
  return def.timeOfDay === 'night' ? createNightDome(def, sunDir) : createDayDome(def, sunDir);
}
