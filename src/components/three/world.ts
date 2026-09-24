import * as THREE from "three";
import { intro } from "@/lib/intro";

// Per-frame shared state between main-scene actors (written in useFrame, never triggers React renders).
export const world = {
  // Half extents of the visible area at the focus plane (z = 0).
  W: 5,
  H: 3,
  pxToWorld: 0.01,
  camDist: 12,
  // Responsive size factor (1 on desktop, smaller on phones).
  k: 1,
  // The stage cat, mapped into this scene so bubbles and charms can react to it.
  cat: {
    pos: new THREE.Vector3(0, -100, 0),
    radius: 0,
    airborne: false,
  },
  pops: [] as { pos: THREE.Vector3; radius: number }[],
};

export const clamp = THREE.MathUtils.clamp;

// 0 → 1 fast-out: things fly outward from the popped intro bubble (screen center).
export function introBurst(delay: number, duration = 1.3) {
  const x = clamp((performance.now() / 1000 - intro.at - delay) / duration, 0, 1);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

// 0 → 1 with a little overshoot, starting `delay` seconds after the preloader lifts.
export function introPop(delay: number, duration = 0.9) {
  const x = clamp((performance.now() / 1000 - intro.at - delay) / duration, 0, 1);
  const c1 = 1.70158;
  return x <= 0 ? 0 : 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
