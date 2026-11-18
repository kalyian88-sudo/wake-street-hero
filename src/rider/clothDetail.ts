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
import type { Material, WebGLProgramParametersWithUniforms } from 'three';

const NOISE = /* glsl */ `
varying vec3 vWshBind;
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
  // folds: stretched along the limb (bind limbs hang along Y), warped so they wander like real creases
  vec3 q = p + vec3(wshNoise(p * 4.0 + 7.1) * 0.04, wshNoise(p * 6.0) * 0.09, wshNoise(p * 4.0 - 3.3) * 0.04);
  float f = wshNoise(vec3(q.x * 5.0, q.y * 21.0, q.z * 5.0));
  float g = wshNoise(vec3(q.x * 11.0 + 2.0, q.y * 13.0, q.z * 11.0 - 5.0));
  f = mix(f, g, 0.35);
  float d = f * 2.0 - 1.0;
  f = 1.0 - d * d; // soft ridges, creases between them
  // folds come and go along the limb instead of ringing it evenly
  float pm = smoothstep(0.35, 0.75, wshNoise(p * 7.0 + 11.0));
  fold = mix(1.0, f, pm);
  float h = f * 0.0056 * pm;
  // medium crumple
  h += (wshNoise(p * 55.0) - 0.5) * 0.0018 * smoothstep(0.012, 0.004, px);
  // knit rows (1.6 mm) — only when the pixel is small enough to resolve them
  float knit = sin(p.y * 3900.0 + sin(p.x * 1900.0 + p.z * 1900.0) * 1.4);
  h += knit * 0.00012 * smoothstep(0.0012, 0.0005, px);
  return h;
}
`;

/** Patch a MeshStandardMaterial (skinned body) with the fabric detail. Safe to call once per material. */
export function addClothDetail(mat: Material): void {
  mat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWshBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWshBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        float wshClothM = smoothstep(0.80, 0.83, roughnessFactor);
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
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'wsh-cloth-2';
  mat.needsUpdate = true;
}
