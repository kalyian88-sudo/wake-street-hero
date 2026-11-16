/**
 * GLSL of the water surface. Built on three's shader chunks so it gets scene fog, tone mapping, output
 * colour space and the sun shadow exactly like every other material.
 *
 * Texture budget per fragment: 2 × wave texture + shore mask (+ sky cube at WATER_DETAIL ≥ 1,
 * + 1 micro wave fetch at WATER_DETAIL 2, + 2 caustic fetches only inside pool / fountain regions).
 */

/** Long lazy swell — shared with the wake ribbon so it rides the same surface. */
export const WATER_SWELL = /* glsl */ `
float wshSwell( vec2 p, float t ) {
	return sin( p.x * 0.37 + p.y * 0.23 + t * 0.9 ) * 0.6 + sin( p.y * 0.41 - p.x * 0.17 + t * 0.7 + 1.7 ) * 0.4;
}
`;

/** Fade the sun shadow out towards the edge of the rider-following shadow frustum (no hard cut line). */
export const SHADOW_FADE_PARS = /* glsl */ `
uniform vec3 uShadowCenter;
uniform vec3 uLightRight;
uniform vec3 uLightUp;
uniform float uShadowRange;
float wshShadow( vec3 worldPos ) {
	float sh = getShadowMask();
	#ifdef USE_SHADOWMAP
		vec3 rel = worldPos - uShadowCenter;
		float edge = max( abs( dot( rel, uLightRight ) ), abs( dot( rel, uLightUp ) ) ) / uShadowRange;
		sh = mix( sh, 1.0, smoothstep( 0.78, 0.98, edge ) );
	#endif
	return sh;
}
`;

export const WATER_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>

attribute vec4 aShallow;
attribute vec4 aDeep;
attribute vec4 aStyle;
uniform float uTime;
uniform float uSwell;
varying vec3 vWorld;
varying vec4 vShallow;
varying vec4 vDeep;
varying vec4 vStyle;
${WATER_SWELL}

void main() {
	vec3 transformed = position;
	#if WATER_DETAIL >= 2
		transformed.y += wshSwell( position.xz, uTime ) * uSwell * aShallow.a;
	#endif
	vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
	vec4 mvPosition = viewMatrix * worldPosition;
	gl_Position = projectionMatrix * mvPosition;
	vWorld = worldPosition.xyz;
	vShallow = aShallow;
	vDeep = aDeep;
	vStyle = aStyle;
	#include <shadowmap_vertex>
	#include <fog_vertex>
}
`;

export const WATER_FRAG = /* glsl */ `
#define SHORE_RANGE 3.0

uniform float uTime;
uniform sampler2D tWaves;
uniform sampler2D tShore;
uniform vec4 uShoreRect;      // minX, minZ, 1/sizeX, 1/sizeZ
#if WATER_DETAIL >= 1
	uniform samplerCube tSky;
	uniform float uSkyLod;
#endif
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunLight;
uniform vec3 uAmbient;
uniform float uWaveStrength;
uniform float uSunSpec;
uniform vec4 uRipples[ MAX_RIPPLES ];   // x, z, radius, slope amplitude
uniform float uRippleFoam[ MAX_RIPPLES ];
uniform int uRippleCount;

varying vec3 vWorld;
varying vec4 vShallow;        // rgb + wave multiplier
varying vec4 vDeep;           // rgb + foam multiplier
varying vec4 vStyle;          // clarity, caustics, depth, opacity

#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${SHADOW_FADE_PARS}

void main() {
	vec3 toCam = cameraPosition - vWorld;
	float dist = length( toCam );
	vec3 V = toCam / dist;
	vec2 p = vWorld.xz;

	// ── normals: two rotated, counter-scrolling fetches of the wave texture ──
	vec2 uvA = vec2( p.x * 0.9744 - p.y * 0.2250, p.x * 0.2250 + p.y * 0.9744 ) * 0.085 + uTime * vec2( 0.012, 0.022 );
	vec2 uvB = vec2( p.x * 0.5446 + p.y * 0.8387, p.y * 0.5446 - p.x * 0.8387 ) * 0.21 + uTime * vec2( - 0.036, 0.019 );
	vec4 sA = texture2D( tWaves, uvA );
	vec4 sB = texture2D( tWaves, uvB );
	vec2 gA = sA.rg * 2.0 - 1.0;
	vec2 gB = sB.rg * 2.0 - 1.0;
	vec2 slope = vec2( gA.x * 0.9744 + gA.y * 0.2250, gA.y * 0.9744 - gA.x * 0.2250 )
		+ vec2( gB.x * 0.5446 - gB.y * 0.8387, gB.x * 0.8387 + gB.y * 0.5446 ) * 0.62;
	float height = sA.a * 0.62 + sB.a * 0.38 - 0.5;
	float noise = clamp( ( sA.b * 0.56 + sB.b * 0.44 ) * 1.9 - 0.2, 0.0, 1.0 );
	#if WATER_DETAIL >= 2
		// micro chop: only matters close to the camera, the mip chain fades it out by itself
		vec2 uvC = vec2( p.x * 0.8910 + p.y * 0.4540, p.y * 0.8910 - p.x * 0.4540 ) * 0.83 + uTime * vec2( 0.07, - 0.05 );
		vec2 gC = texture2D( tWaves, uvC ).rg * 2.0 - 1.0;
		slope += vec2( gC.x * 0.8910 - gC.y * 0.4540, gC.x * 0.4540 + gC.y * 0.8910 ) * 0.36;
	#endif
	#if WATER_DETAIL >= 1
		// long slow undulation: wide moving bands in the reflection (a third layer for free)
		slope += vec2( cos( p.x * 0.31 + p.y * 0.12 + uTime * 0.55 ), cos( p.y * 0.27 - p.x * 0.09 + uTime * 0.42 ) ) * 0.1;
	#endif
	slope *= uWaveStrength * vShallow.a;

	// ── ripple rings ──
	float ringFoam = 0.0;
	for ( int i = 0; i < uRippleCount; i ++ ) {
		vec4 rp = uRipples[ i ];
		vec2 d = p - rp.xy;
		float r = length( d );
		float w = ( r - rp.z ) / ( 0.2 + 0.09 * rp.z );
		float e = exp( - w * w );
		slope -= ( d / max( r, 0.001 ) ) * ( e * sin( w * 2.6 ) * rp.w );
		ringFoam += e * uRippleFoam[ i ];
	}

	vec3 N = normalize( vec3( - slope.x, 1.0, - slope.y ) );
	float NdV = max( dot( N, V ), 0.0 );
	float fres = 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 );

	// ── reflected sky ──
	vec3 R = reflect( - V, N );
	R.y = abs( R.y ) + 0.012;
	#if WATER_DETAIL >= 1
		vec3 sky = textureLod( tSky, R, uSkyLod ).rgb;
	#else
		R = normalize( R );
		vec3 sky = mix( uSkyHorizon, uSkyZenith, pow( R.y, 0.5 ) );
		sky += uSunLight * ( 0.05 * uSunSpec ) * pow( max( dot( R, uSunDir ), 0.0 ), 18.0 );
	#endif

	// ── shore mask (wobbles with the waves like a refracted bank) ──
	float shore = texture2D( tShore, ( p + slope * 0.7 - uShoreRect.xy ) * uShoreRect.zw ).r;
	float dm = shore * SHORE_RANGE;

	float sh = wshShadow( vWorld );
	float sunUp = max( uSunDir.y, 0.0 );
	vec3 light = uAmbient + uSunLight * ( sunUp * 0.34 * sh );

	// ── water body: deep ↔ shallow by view angle, clarity, bank distance and wave crests ──
	float clarity = vStyle.x;
	float shallowEdge = 1.0 - smoothstep( 0.0, 2.4, dm );
	float k = clarity * ( 0.18 + 0.82 * clamp( V.y, 0.0, 1.0 ) ) + shallowEdge * shallowEdge * ( 0.22 + 0.4 * clarity ) + height * 0.5;
	vec3 body = mix( vDeep.rgb, vShallow.rgb, clamp( k, 0.0, 1.0 ) );
	#ifdef WATER_BOTTOM
		if ( vStyle.y > 0.0 ) {
			// virtual tiled floor seen through the surface, with dancing caustics
			float depth = vStyle.z;
			vec2 bp = p - V.xz / ( V.y + 0.4 ) * ( depth * 0.7 ) + slope * ( depth * 1.1 );
			vec2 tile = abs( fract( bp * 1.6 ) - 0.5 );
			float aa = fwidth( bp.x ) * 1.6 + fwidth( bp.y ) * 1.6;
			float grout = smoothstep( 0.46 - aa, 0.5, max( tile.x, tile.y ) ) * clamp( 1.0 - aa * 2.5, 0.0, 1.0 );
			float c1 = texture2D( tWaves, bp * 0.21 + uTime * vec2( 0.03, 0.018 ) ).a;
			float c2 = texture2D( tWaves, bp * 0.27 - uTime * vec2( 0.022, 0.03 ) + 0.4 ).a;
			float caustic = pow( clamp( 1.0 - abs( c1 - c2 ) * 5.0, 0.0, 1.0 ), 5.0 ) * vStyle.y;
			vec3 floorCol = vShallow.rgb * ( 1.0 - grout * 0.24 ) * ( 0.8 + 1.5 * caustic * sh * sunUp + 0.35 * caustic );
			float absorb = exp( - depth / max( V.y, 0.25 ) * ( 1.06 - clarity ) * 0.9 );
			body = mix( body, floorCol, absorb );
		}
	#endif
	body *= light;
	// sun glowing through the wave faces when looking towards it
	float through = pow( max( dot( - V, uSunDir ), 0.0 ), 3.0 ) * ( 0.5 + height ) * sunUp;
	body += vShallow.rgb * uSunLight * ( through * 0.22 * sh * uSunSpec );

	vec3 col = mix( body, sky, fres );

	// ── sun glitter (GGX, gets rougher with distance so it never aliases into noise) ──
	vec3 H = normalize( uSunDir + V );
	float NdH = max( dot( N, H ), 0.0 );
	float a = 0.03 + 0.11 * smoothstep( 8.0, 160.0, dist );
	float a2 = a * a;
	float dn = NdH * NdH * ( a2 - 1.0 ) + 1.0;
	float D = a2 / ( PI * dn * dn );
	float F = 0.02 + 0.98 * pow( 1.0 - max( dot( V, H ), 0.0 ), 5.0 );
	col += uSunLight * ( min( D * F * 0.25, 22.0 ) * sh * uSunSpec * step( 0.0, uSunDir.y ) );

	// ── foam: lapping band along the banks + a drifting line + ripple rings ──
	float lap = sin( dm * 4.2 - uTime * 1.3 + noise * 3.0 ) * 0.5 + 0.5;
	float band = 1.0 - smoothstep( 0.0, 0.4 + 0.32 * lap, dm );
	float cover = band * ( 0.6 + 0.4 * lap );
	float drift = fract( uTime * 0.11 + sA.b * 0.3 );
	cover += smoothstep( 0.18, 0.0, abs( dm - ( 0.45 + drift * 1.2 ) ) ) * smoothstep( 0.0, 0.2, drift ) * ( 1.0 - drift ) * 0.55;
	cover = cover * vDeep.a + ringFoam;
	float foam = smoothstep( 1.0 - cover * 1.1, 1.26 - cover * 1.1, noise );
	vec3 foamCol = ( uAmbient * 1.2 + uSunLight * ( sunUp * 0.4 * sh ) ) * vec3( 0.94, 0.97, 1.0 );
	col = mix( col, foamCol, foam * 0.92 );

	float alpha = 1.0;
	#ifdef WATER_BLEND
		alpha = mix( vStyle.w, 1.0, max( fres, foam ) );
		alpha *= mix( smoothstep( 0.0, 0.3, dm ), 1.0, step( 0.999, vStyle.w ) );
	#endif
	gl_FragColor = vec4( col, alpha );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

export const WAKE_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>

attribute vec4 aA;            // emission point xyz, birth time
attribute vec4 aB;            // right-of-travel x, z, side (-1 left / 0 / +1 right), strength
attribute float aLean;
uniform float uTime;
uniform float uSwell;
varying vec3 vWorld;
varying vec4 vWake;           // signed lateral distance (m), half width (m), age (s), strength
varying float vLean;
${WATER_SWELL}

void main() {
	float age = max( uTime - aA.w, 0.0 );
	float side = aB.z;
	// the V opens fast, then the arms run out of energy
	float spread = WAKE_SPREAD * ( 1.0 - exp( - age * 0.42 ) ) / 0.42 * ( 0.62 + 0.38 * min( aB.w, 1.0 ) );
	// the arm on the spray side (opposite to the lean) is thrown further out
	float halfW = ( 0.2 + spread ) * ( 1.0 + 0.3 * clamp( - aLean * side, - 1.0, 1.0 ) );
	vec3 transformed = aA.xyz + vec3( aB.x, 0.0, aB.y ) * ( side * halfW );
	#if WATER_DETAIL >= 2
		transformed.y += wshSwell( transformed.xz, uTime ) * uSwell;
	#endif
	vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
	vec4 mvPosition = viewMatrix * worldPosition;
	gl_Position = projectionMatrix * mvPosition;
	vWorld = worldPosition.xyz;
	vWake = vec4( side * halfW, halfW, age, aB.w );
	vLean = aLean;
	#include <shadowmap_vertex>
	#include <fog_vertex>
}
`;

export const WAKE_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D tWaves;
uniform vec3 uFoamLit;
uniform vec3 uFoamShade;
uniform vec3 uAerLit;
uniform vec3 uAerShade;
uniform vec3 uCrest;
varying vec3 vWorld;
varying vec4 vWake;
varying float vLean;

#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${SHADOW_FADE_PARS}

void main() {
	float ad = abs( vWake.x );
	float halfW = vWake.y;
	float t = vWake.z;
	float S = vWake.w;
	vec2 p = vWorld.xz;
	float n1 = texture2D( tWaves, p * 0.47 + vec2( uTime * 0.02, 0.0 ) ).b;
	float n2 = texture2D( tWaves, vec2( p.y, - p.x ) * 1.31 + vec2( 0.0, uTime * 0.035 ) ).b;
	float n = clamp( ( n1 * 0.55 + n2 * 0.45 ) * 1.9 - 0.2, 0.0, 1.0 );

	// churned white water straight behind the board: narrow, dense, gone in about a second
	float coreW = 0.2 + 0.42 * ( 1.0 - exp( - t * 2.2 ) );
	float core = ( 1.0 - smoothstep( coreW * 0.4, coreW, ad ) ) * exp( - t * 1.7 );
	// diverging arms: a thin foam crest riding the outer edge of the V
	float inset = halfW - ad;
	float armW = 0.1 + 0.14 * t;
	float edgeIn = smoothstep( 0.0, 0.035, inset );
	float arm = edgeIn * ( 1.0 - smoothstep( armW * 0.3, armW, inset ) ) * exp( - t * 0.75 );
	arm *= 1.0 + 0.6 * clamp( - vLean * sign( vWake.x ), - 1.0, 1.0 );
	// lacy leftovers between the arms
	float lace = ( 1.0 - smoothstep( 0.0, halfW * 0.9, ad ) ) * exp( - t * 0.9 ) * 0.34;
	float cover = clamp( ( core * 0.95 + arm * 0.85 + lace ) * S, 0.0, 0.92 );
	float foam = smoothstep( 1.0 - cover, 1.22 - cover, n );

	// aerated, flattened water inside the V + the wave itself: bright crest, dark trough behind it
	float life = 1.0 - smoothstep( WAKE_LIFE * 0.6, WAKE_LIFE, t );
	float wave = exp( - t * 0.34 ) * min( S, 1.0 ) * edgeIn;
	float aer = ( 1.0 - smoothstep( halfW * 0.15, halfW, ad ) ) * exp( - t * 0.7 ) * 0.36 * min( S, 1.0 );
	float crest = ( 1.0 - smoothstep( 0.03, 0.22, abs( inset - 0.1 ) ) ) * wave * 0.3;
	float trough = ( 1.0 - smoothstep( 0.08, 0.36, abs( inset - 0.46 ) ) ) * wave * 0.22;

	float sh = wshShadow( vWorld );
	vec3 foamCol = mix( uFoamShade, uFoamLit, sh );
	vec3 aerCol = mix( uAerShade, uAerLit, sh );

	// back-to-front "over" of: trough (dark) → aerated tint → crest glint → foam
	vec3 rgb = aerCol * 0.25 * trough;
	float al = trough;
	rgb = rgb * ( 1.0 - aer ) + aerCol * aer;
	al = al * ( 1.0 - aer ) + aer;
	rgb = rgb * ( 1.0 - crest ) + uCrest * crest;
	al = al * ( 1.0 - crest ) + crest;
	rgb = rgb * ( 1.0 - foam ) + foamCol * foam;
	al = al * ( 1.0 - foam ) + foam;
	if ( al * life < 0.003 ) discard;
	gl_FragColor = vec4( rgb / al, al * life );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;
