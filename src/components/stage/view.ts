import * as THREE from "three";

// The stage camera looks at the z = 0 plane; 100 CSS px ≈ 1 world unit at the screen center.
export const PX = 0.01;
export const FOV = 22;
export const TILT = THREE.MathUtils.degToRad(9);

export const view = {
  camera: null as THREE.PerspectiveCamera | null,
  vw: 1,
  vh: 1,
  pointerX: 0,
  pointerY: 0,
};

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2();
const a = new THREE.Vector3();
const b = new THREE.Vector3();

// Screen px → point on the stage plane (exact, so the cat's feet sit precisely on DOM edges).
export function toWorld(px: number, py: number, out: THREE.Vector3) {
  const cam = view.camera;
  if (!cam) return out.set(0, 0, 0);
  ndc.set((px / view.vw) * 2 - 1, -(py / view.vh) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  if (!raycaster.ray.intersectPlane(plane, out)) out.set(0, 0, 0);
  return out;
}

// World units per px around a screen point (perspective makes it vary slightly across the screen).
export function unitsPerPx(px: number, py: number) {
  toWorld(px, py, a);
  toWorld(px, py - 100, b);
  return a.distanceTo(b) / 100;
}

// Cat height in px for the current viewport; length follows the model's proportions.
export function catHeight(vw: number) {
  return vw < 700 ? 64 : THREE.MathUtils.clamp(vw * 0.07, 76, 112);
}
export const CAT_ASPECT = 1.78;
