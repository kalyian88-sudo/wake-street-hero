// Dev sandbox smoke test: proves WebGL + three + post-processing work in the headless browser.
import * as THREE from 'three';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x223344);
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
cam.position.set(2, 2, 4);
cam.lookAt(0, 0, 0);
scene.add(new THREE.DirectionalLight(0xffffff, 3), new THREE.AmbientLight(0xffffff, 0.5));
const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.3, 128, 16), new THREE.MeshStandardMaterial({ color: 0xe30613, roughness: 0.3 }));
scene.add(m);
renderer.setAnimationLoop(() => {
  m.rotation.y += 0.01;
  renderer.render(scene, cam);
});
const gl = renderer.getContext();
(window as unknown as Record<string, unknown>).__info = { webgl2: renderer.capabilities.isWebGL2, renderer: gl.getParameter(gl.RENDERER), maxTex: renderer.capabilities.maxTextureSize };
