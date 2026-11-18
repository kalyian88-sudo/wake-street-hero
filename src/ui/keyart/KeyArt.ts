/**
 * Living key art for the title screen ("bullet time"). The painted poster is split into three layers —
 * the plate with the riders painted out, and the two riders cut out with soft alpha — and one fragment
 * shader puts them back together every frame:
 *   · the camera drifts on a small arc: sky and city slide one way, the near water the other (parallax
 *     round the riders, who are the centre of the orbit);
 *   · each rider breathes — a slow bob and a hair of rotation;
 *   · the spray hangs and drifts (the painted droplets wobble on a slow flow field, extra refractive
 *     drops float through the splash);
 *   · the water ripples and glitters, the sun glow pulses, the clouds breathe.
 * The poster's own title area is not used — the title, logo and button are crisp DOM on top.
 * Plate space = poster pixels (941 × 900, y down). Below the plate the water is continued procedurally.
 */
import bgUrl from '../../brand/keyart/bg.webp';
import riderAUrl from '../../brand/keyart/riderA.webp';
import riderBUrl from '../../brand/keyart/riderB.webp';

const PLATE_W = 941;
const PLATE_H = 900;
/** Full poster height: the composition is laid out against it (title below the plate). */
const POSTER_H = 1672;
/** Cut-outs: [x, y, w, h] in plate pixels + the pivot they bob around. */
const RIDER_A = { rect: [3, 2, 938, 572], pivot: [260, 330] } as const;
const RIDER_B = { rect: [483, 182, 458, 476], pivot: [690, 440] } as const;

const VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `
precision highp float;
uniform sampler2D uBg;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uRes;      // canvas px
uniform float uScale;   // canvas px per plate px
uniform vec2 uOff;      // canvas px of the plate origin (y down)
uniform float uTime;
uniform vec2 uCam;      // camera arc shift (plate px)
uniform vec4 uRectA;
uniform vec4 uRectB;
uniform vec4 uMoveA;    // pivot.xy, rotation, unused
uniform vec4 uMoveB;
uniform vec2 uBobA;
uniform vec2 uBobB;

const vec2 PLATE = vec2(${PLATE_W}.0, ${PLATE_H}.0);
const vec2 SUN = vec2(430.0, 693.0);
const float HORIZON = 772.0;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float ell(vec2 p, vec2 c, vec2 r) { vec2 d = (p - c) / r; return 1.0 - smoothstep(0.6, 1.0, dot(d, d)); }

// spray zones of the painting (where the painted droplets are)
float spray(vec2 p) {
  float m = ell(p, vec2(105.0, 330.0), vec2(150.0, 340.0));
  m = max(m, ell(p, vec2(440.0, 480.0), vec2(80.0, 130.0)));
  m = max(m, ell(p, vec2(690.0, 600.0), vec2(220.0, 80.0)));
  m = max(m, ell(p, vec2(230.0, 560.0), vec2(120.0, 90.0)));
  m = max(m, ell(p, vec2(120.0, 775.0), vec2(190.0, 60.0)));
  return m;
}

// parallax weight: far sky / city follow the camera, the near water goes the other way
float depthK(float y) {
  if (y < HORIZON) return 1.0 - 0.15 * smoothstep(560.0, HORIZON, y);
  return mix(0.85, -1.1, smoothstep(HORIZON, 1250.0, y));
}

vec3 plate(vec2 q) {
  q.x = abs(q.x);                              // landscape: mirror past the left edge
  q.x = PLATE.x - abs(PLATE.x - q.x);
  return texture2D(uBg, clamp(q, vec2(0.5), PLATE - 0.5) / PLATE).rgb;
}

vec3 background(vec2 p) {
  vec2 q = p - uCam * depthK(p.y);
  float t = uTime;
  // clouds breathe
  float sky = 1.0 - smoothstep(560.0, 700.0, p.y);
  q.x += sky * (sin(p.y * 0.011 + t * 0.21) * 1.6 + (noise(p * 0.01 + t * 0.05) - 0.5) * 2.0);
  // painted spray floats on a slow flow field
  float sp = spray(p);
  q += sp * vec2(noise(p * 0.018 + vec2(t * 0.11, 3.0)) - 0.5, noise(p * 0.018 + vec2(7.0, t * 0.13)) - 0.5) * 7.0;
  q.y += sp * sin(t * 0.35 + p.x * 0.02) * 1.5;
  // water: ripples get stronger towards the camera
  float wet = smoothstep(HORIZON, HORIZON + 30.0, p.y);
  float near = smoothstep(HORIZON, 1100.0, p.y);
  q.x += wet * sin(p.y * 0.21 + t * 1.5 + sin(p.x * 0.031 + t * 0.6) * 2.2) * (0.8 + 2.4 * near);
  q.y += wet * sin(p.x * 0.043 - t * 1.15 + p.y * 0.05) * (0.6 + 1.4 * near);
  // below the plate: carry the near water on (mirrored band, ever darker)
  float below = max(0.0, q.y - (PLATE.y - 4.0));
  if (below > 0.0) {
    // mirror the calm band under the foam (rows 842–896), stretched and drifting sideways
    float band = 54.0;
    float m = mod(below * 0.45, 2.0 * band);
    q.y = PLATE.y - 4.0 - (m < band ? m : 2.0 * band - m);
    q.x = q.x * 0.9 + 60.0 + below * 0.25 + sin(below * 0.05 + t * 0.9) * 6.0;
  }
  vec3 c = plate(q);
  if (below > 0.0) c *= mix(0.85, 0.22, smoothstep(0.0, 600.0, below));
  // glitter on the bright water
  if (wet > 0.0) {
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float g = noise(p * vec2(0.32, 0.9) + vec2(t * 0.9, -t * 0.4));
    g = pow(g, 14.0) * 5.0 + pow(noise(p * 0.6 - t * 0.7), 18.0) * 3.0;
    c += wet * g * smoothstep(0.35, 0.8, lum) * vec3(1.0, 0.82, 0.55);
  }
  // sun glow pulse
  float d = length(p - SUN);
  c += vec3(1.0, 0.7, 0.35) * exp(-d / 85.0) * 0.07 * (1.0 + sin(t * 0.8));
  return c;
}

vec4 rider(sampler2D tex, vec4 rect, vec4 mv, vec2 bob, vec2 p) {
  vec2 pv = mv.xy;
  float a = -mv.z;
  vec2 d = p - pv - bob - uCam * 0.12;
  vec2 r = vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y) + pv;
  vec2 uv = (r - rect.xy) / rect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(tex, uv);
}

// extra drops drifting through the spray: little lenses that flip what is behind them
vec3 drops(vec2 p, vec3 c) {
  for (int i = 0; i < 28; i++) {
    float fi = float(i);
    vec2 h = vec2(hash(vec2(fi, 1.3)), hash(vec2(fi, 7.1)));
    // seed inside one of the spray zones
    vec2 base = fi < 12.0 ? vec2(20.0, 120.0) + h * vec2(220.0, 560.0)
              : fi < 18.0 ? vec2(380.0, 380.0) + h * vec2(120.0, 220.0)
              : fi < 24.0 ? vec2(520.0, 520.0) + h * vec2(320.0, 140.0)
              : vec2(10.0, 700.0) + h * vec2(260.0, 90.0);
    float sp = 0.25 + hash(vec2(fi, 3.7)) * 0.5;
    vec2 pos = base + vec2(sin(uTime * 0.23 * sp + fi) * 9.0, sin(uTime * 0.31 * sp + fi * 1.7) * 14.0 - mod(uTime * 2.2 * sp + fi * 13.0, 40.0) + 20.0);
    float rad = 1.8 + hash(vec2(fi, 9.2)) * 3.6;
    vec2 d = (p - pos) / rad;
    float r2 = dot(d, d);
    if (r2 < 1.0) {
      vec3 seen = plate(pos - d * rad * 2.2 - uCam * depthK(pos.y));
      float rim = smoothstep(0.55, 1.0, r2);
      vec3 drop = mix(seen * 1.15 + 0.05, seen * 0.45, rim);
      drop += vec3(1.0, 0.95, 0.85) * smoothstep(0.25, 0.0, length(d - vec2(-0.35, -0.4))) * 1.2;
      float edge = 1.0 - smoothstep(0.82, 1.0, r2);
      c = mix(c, drop, edge * 0.92);
    }
  }
  return c;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = (px - uOff) / uScale;
  vec3 c = background(p);
  vec4 b = rider(uB, uRectB, uMoveB, uBobB, p);
  c = mix(c, b.rgb, b.a);
  vec4 a = rider(uA, uRectA, uMoveA, uBobA, p);
  c = mix(c, a.rgb, a.a);
  c = drops(p, c);
  gl_FragColor = vec4(c, 1.0);
}`;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('key art image failed: ' + url));
    img.src = url;
  });
}

export class KeyArt {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private readonly u: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private running = false;
  private ready = false;
  private t0 = performance.now();
  private readonly still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wn-keyart';
    this.canvas.setAttribute('aria-hidden', 'true');
    void this.init();
  }

  private async init(): Promise<void> {
    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) {
      this.canvas.classList.add('is-fallback');
      return;
    }
    this.gl = gl;
    const sh = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type) as WebGLShader;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('[keyart]', gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram() as WebGLProgram;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[keyart]', gl.getProgramInfoLog(prog));
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uBg', 'uA', 'uB', 'uRes', 'uScale', 'uOff', 'uTime', 'uCam', 'uRectA', 'uRectB', 'uMoveA', 'uMoveB', 'uBobA', 'uBobB']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    const imgs = await Promise.all([loadImage(bgUrl), loadImage(riderAUrl), loadImage(riderBUrl)]).catch((e: unknown) => {
      console.error(e);
      return null;
    });
    if (!imgs || this.gl !== gl) return;
    imgs.forEach((img, i) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    gl.uniform1i(this.u.uBg, 0);
    gl.uniform1i(this.u.uA, 1);
    gl.uniform1i(this.u.uB, 2);
    gl.uniform4f(this.u.uRectA, ...RIDER_A.rect);
    gl.uniform4f(this.u.uRectB, ...RIDER_B.rect);
    this.ready = true;
    this.canvas.classList.add('is-ready');
    if (this.running) this.frame();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.ready) this.frame();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly frame = (): void => {
    if (!this.running) return;
    this.draw((performance.now() - this.t0) / 1000);
    if (!this.still) this.raf = requestAnimationFrame(this.frame);
  };

  private draw(time: number): void {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    const W = Math.round(cw * dpr);
    const H = Math.round(ch * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    gl.viewport(0, 0, W, H);
    // layout: portrait = the poster covers the screen from the top (title area below the plate);
    // landscape = the plate fills the height on the right, the title sits on the left
    const portrait = W < H;
    const t = this.still ? 0 : time;
    // a slow breath of zoom round the riders
    const zoom = 1.035 + 0.015 * Math.sin(t * 0.17);
    const base = portrait ? Math.max((W / PLATE_W) * 1.06, (H / POSTER_H) * 0.9) : (H / PLATE_H) * 1.02;
    const ox0 = portrait ? (W - PLATE_W * base) / 2 : W - PLATE_W * base * 0.97;
    const oy0 = portrait ? -H * 0.01 : -H * 0.015;
    // zoom about the riders' centre (plate px)
    const cx = 480;
    const cy = 380;
    const scale = base * zoom;
    const ox = ox0 + cx * base - cx * scale;
    const oy = oy0 + cy * base - cy * scale;
    gl.uniform2f(this.u.uRes, W, H);
    gl.uniform1f(this.u.uScale, scale);
    gl.uniform2f(this.u.uOff, ox, oy);
    gl.uniform1f(this.u.uTime, t);
    // camera on a small arc: mostly sideways, a little up / down
    gl.uniform2f(this.u.uCam, Math.sin(t * 0.21) * 13, Math.sin(t * 0.13 + 1) * 3);
    gl.uniform4f(this.u.uMoveA, RIDER_A.pivot[0], RIDER_A.pivot[1], Math.sin(t * 0.47) * 0.007, 0);
    gl.uniform4f(this.u.uMoveB, RIDER_B.pivot[0], RIDER_B.pivot[1], Math.sin(t * 0.53 + 2) * 0.009, 0);
    gl.uniform2f(this.u.uBobA, Math.sin(t * 0.31) * 1.2, Math.sin(t * 0.62) * 3.2);
    gl.uniform2f(this.u.uBobB, Math.sin(t * 0.37 + 1) * 1.2, Math.sin(t * 0.71 + 2.2) * 3.6);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.stop();
    const ext = this.gl?.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    this.gl = null;
  }
}
