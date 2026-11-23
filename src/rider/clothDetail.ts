/**
 * Procedural fabric detail for the rider's body material (no extra textures, no UV unwrap):
 * the fragment shader builds a height field in BIND space (the cloth sticks to the body when it moves)
 * and bump-maps it — soft compression folds running across the sleeves and the shorts, a medium
 * crumple, and a fine knit that fades out once it is smaller than a pixel. Folds also darken the
 * albedo a little (cavity) so they still read on a small phone screen, and cloth gets a soft fuzz rim.
 *
 * Which pixels are cloth is decided by the roughness atlas: everything rougher than ~0.81 is fabric
 * (jersey 0.86, shorts 0.86, hoodie 0.93, cloth swatch 0.84); skin, neoprene, helmet and boots are not.
 */
import type { Material, Vector4, WebGLProgramParametersWithUniforms } from 'three';

const NOISE = /* glsl */ `
varying vec3 vWshBind;
uniform vec4 uWshJoints; // bind-space heights: elbow, waist, armpit, knee
float wshHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float wshNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wshHash(i), wshHash(i + vec3(1, 0, 0)), f.x), mix(wshHash(i + vec3(0, 1, 0)), wshHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wshHash(i + vec3(0, 0, 1)), wshHash(i + vec3(1, 0, 1)), f.x), mix(wshHash(i + vec3(0, 1, 1)), wshHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// fabric height (m) at bind-space point p; px = world size of one pixel (for anti-aliasing)
float wshCloth(vec3 p, float px, out float fold) {
  // where the cloth sits: sleeves / legs (bind limbs hang along Y) or the body of the shirt
  float ax = abs(p.x);
  float arm = smoothstep(0.13, 0.17, ax);
  float limb = max(arm, smoothstep(uWshJoints.y - 0.1, uWshJoints.y - 0.2, p.y));
  // …and where the body bends: inside the elbows, at the armpits
  float bend = arm * exp(-pow((p.y - uWshJoints.x) / 0.055, 2.0));
  bend = max(bend, smoothstep(0.1, 0.15, ax) * (1.0 - arm * 0.5) * exp(-pow((p.y - uWshJoints.z) / 0.05, 2.0)));
  // folds: compression rings across the limbs, long hanging drapes down the body; warped so they wander like real creases
  vec3 q = p + vec3(wshNoise(p * 4.0 + 7.1) * 0.04, wshNoise(p * 6.0) * 0.09, wshNoise(p * 4.0 - 3.3) * 0.04);
  float f = mix(wshNoise(q * vec3(13.0, 4.0, 13.0)), wshNoise(q * vec3(5.0, 21.0, 5.0)), max(limb, bend));
  float g = wshNoise(vec3(q.x * 11.0 + 2.0, q.y * 13.0, q.z * 11.0 - 5.0));
  f = mix(f, g, 0.3);
  float d = f * 2.0 - 1.0;
  f = 1.0 - d * d; // soft ridges, creases between them
  // folds come and go instead of covering the cloth evenly, but always bunch up at the bends
  float waist = 0.45 * (1.0 - arm) * exp(-pow((p.y - uWshJoints.y) / 0.08, 2.0));
  float pm = max(smoothstep(0.35, 0.75, wshNoise(p * 7.0 + 11.0)), max(bend, waist));
  fold = mix(1.0, f, pm);
  float h = f * (0.0056 + 0.004 * bend) * pm;
  // medium crumple
  h += (wshNoise(p * 55.0) - 0.5) * 0.001 * smoothstep(0.012, 0.004, px);
  // knit rows (1.6 mm) — only when the pixel is small enough to resolve them
  float knit = sin(p.y * 3900.0 + sin(p.x * 1900.0 + p.z * 1900.0) * 1.4);
  h += knit * 0.00012 * smoothstep(0.0012, 0.0005, px);
  return h;
}
`;

/** Patch a MeshStandardMaterial (skinned body) with the fabric detail. Safe to call once per material. */
export function addClothDetail(mat: Material, joints: { value: Vector4 }): void {
  mat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uWshJoints = joints;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWshBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWshBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        float wshClothM = smoothstep(0.80, 0.83, roughnessFactor);
        // skin mask = blue channel of the roughness atlas
        float wshSkin = smoothstep(0.25, 0.45, texelRoughness.b - texelRoughness.g);
        float wshFold = 0.0;
        float wshH = 0.0;
        if (wshClothM > 0.0) {
          float px = length(fwidth(vWshBind));
          wshH = wshCloth(vWshBind, px, wshFold) * wshClothM;
          // crease cavity: darker in the valleys of the folds
          diffuseColor.rgb *= 1.0 - wshClothM * 0.34 * (1.0 - wshFold) * smoothstep(0.03, 0.006, px);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        if (wshClothM > 0.0) {
          vec3 sp = -vViewPosition;
          vec3 sx = dFdx(sp);
          vec3 sy = dFdy(sp);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec2 dh = vec2(dFdx(wshH), dFdy(wshH));
          vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          normal = normalize(abs(det) * normal - grad);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `if (wshClothM > 0.0) {
          float fz = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
          outgoingLight += wshClothM * fz * 0.35 * diffuseColor.rgb * (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + 0.08);
        }
        if (wshSkin > 0.0) {
          // cheap subsurface look: warm red bleed towards grazing angles and a slightly warmer, deeper diffuse
          float nv = saturate(dot(normal, normalize(vViewPosition)));
          vec3 lit = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
          outgoingLight += wshSkin * pow(1.0 - nv, 2.5) * 0.2 * vec3(1.0, 0.42, 0.28) * lit;
          outgoingLight *= mix(vec3(1.0), vec3(1.05, 0.985, 0.95), wshSkin);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'wsh-cloth-6';
  mat.needsUpdate = true;
}
