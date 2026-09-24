"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { introFx } from "@/lib/introFx";
import { createBubbleMaterial, createHolo } from "./materials";

// Loader → landing, in the main scene (~2s). The glyphs of "100%" inflate into real glass bubbles
// (same material as the bubbles on the page); more bubbles fizz up from the bottom edge like in a
// soda. Everything rises, sways and swells — then they all pop at almost the same moment, tearing
// liquid, iridescent holes into the dark curtain that merge and reveal the page.

const INFLATE = 0.35;
const POP = 1.0; // when the pops start
const POP_SPREAD = 0.1; // all pops land within this window
const HOLE_TIME = 0.9;

// Bubble plan. Glyph bubbles start at their glyph (seed); fizz bubbles enter from below the screen.
// x/y: where they are when they pop (fractions of the viewport); r: size then (fraction of min(vw, vh)).
type Plan = { glyph: number; x: number; y: number; r: number; start: number };
const PLAN: Plan[] = [
  { glyph: 0, x: 0.2, y: 0.46, r: 0.1, start: 0.12 },
  { glyph: 1, x: 0.4, y: 0.3, r: 0.14, start: 0.16 },
  { glyph: 2, x: 0.58, y: 0.52, r: 0.16, start: 0.2 },
  { glyph: 3, x: 0.76, y: 0.34, r: 0.1, start: 0.24 },
  { glyph: -1, x: 0.08, y: 0.72, r: 0.07, start: 0.0 },
  { glyph: -1, x: 0.3, y: 0.78, r: 0.085, start: 0.05 },
  { glyph: -1, x: 0.5, y: 0.86, r: 0.06, start: 0.1 },
  { glyph: -1, x: 0.9, y: 0.62, r: 0.08, start: 0.02 },
  { glyph: -1, x: 0.72, y: 0.78, r: 0.1, start: 0.08 },
  { glyph: -1, x: 0.14, y: 0.18, r: 0.065, start: 0.0 },
  { glyph: -1, x: 0.88, y: 0.14, r: 0.07, start: 0.04 },
  { glyph: -1, x: 0.52, y: 0.12, r: 0.075, start: 0.06 },
];
const MAX = PLAN.length;
// Tiny, fixed offsets so the pops crackle rather than land on one frame.
const POP_AT = PLAN.map((_, i) => POP + (((i * 37) % 11) / 10) * POP_SPREAD);
const FIRST_POP = Math.min(...POP_AT);
const LAST_POP = Math.max(...POP_AT);

// Module-level uniforms: this is a singleton effect animated every frame.
const uniforms = {
  uHoles: { value: Array.from({ length: MAX }, () => new THREE.Vector3(0, 0, -1)) },
  uRim: { value: 0 },
  uFlash: { value: 0 },
  uActive: { value: 0 },
  uTime: { value: 0 },
  uDpr: { value: 1 },
  uViewH: { value: 1 },
  uBg: { value: new THREE.Vector3(11 / 255, 9 / 255, 22 / 255) },
};

const vertex = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Signed distance (px) to the union of all holes; wobbling edges and a smooth-min merge.
const field = /* glsl */ `
  uniform vec3 uHoles[${MAX}];
  uniform float uTime;
  uniform float uDpr;
  uniform float uViewH;
  float holes(vec2 p) {
    float h = 1e5;
    for (int i = 0; i < ${MAX}; i++) {
      vec3 H = uHoles[i];
      if (H.z <= 0.0) continue;
      vec2 d = p - H.xy;
      float ang = atan(d.y, d.x);
      float wob = sin(ang * 5.0 + uTime * 6.0 + float(i) * 1.7) * 0.03 + sin(ang * 9.0 - uTime * 8.0 + float(i)) * 0.015;
      float di = length(d) - H.z * (1.0 + wob);
      float k = 70.0;
      float m = clamp(0.5 + 0.5 * (h - di) / k, 0.0, 1.0);
      h = mix(h, di, m) - k * m * (1.0 - m);
    }
    return h;
  }
  vec2 cssPos() {
    return vec2(gl_FragCoord.x, uViewH * uDpr - gl_FragCoord.y) / uDpr;
  }
`;

// Opaque curtain: identical color to the DOM loader, holes cut out.
const curtainFragment = /* glsl */ `
  uniform float uActive;
  uniform vec3 uBg;
  ${field}
  void main() {
    if (uActive < 0.5) discard;
    if (holes(cssPos()) < 0.0) discard;
    gl_FragColor = vec4(uBg, 1.0);
  }
`;

// Additive pastel-holo rim along the torn edges + a short flash spilling into the holes.
const rimFragment = /* glsl */ `
  uniform float uActive;
  uniform float uRim;
  uniform float uFlash;
  ${field}
  void main() {
    if (uActive < 0.5) discard;
    vec2 p = cssPos();
    float h = holes(p);
    float band = exp(-pow(h / 14.0, 2.0)) * uRim * 0.85;
    float hue = 0.5 + 0.5 * sin(atan(p.y - uViewH * 0.5, p.x) * 3.0 + uTime * 2.5 + h * 0.03);
    vec3 pink = vec3(1.0, 0.72, 0.9);
    vec3 lilac = vec3(0.78, 0.68, 1.0);
    vec3 blue = vec3(0.64, 0.82, 1.0);
    vec3 holo = hue < 0.5 ? mix(pink, lilac, hue * 2.0) : mix(lilac, blue, hue * 2.0 - 1.0);
    float glow = uFlash * uFlash * smoothstep(0.0, -220.0, h) * 0.28;
    gl_FragColor = vec4(holo * band + vec3(1.0, 0.94, 1.0) * glow, 1.0);
  }
`;

const easeOutElastic = (x: number) =>
  x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
// Buoyant rise: picks up speed, then glides.
const easeRise = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Drop = { x: number; y: number; vx: number; vy: number; s: number; born: number };

export default function IntroFX() {
  const camera = useThree((s) => s.camera);
  const dpr = useThree((s) => s.viewport.dpr);
  const size = useThree((s) => s.size);

  const materials = useMemo(
    () => ({
      curtain: new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: curtainFragment, uniforms, depthTest: false, depthWrite: false }),
      rim: new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: rimFragment,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      bubble: createBubbleMaterial(),
      drop: createHolo({ color: "#ffd2ee", rim: 0.9, envMapIntensity: 1.6 }),
    }),
    [],
  );

  const bubbles = useRef<(THREE.Mesh | null)[]>([]);
  const drops = useRef<THREE.InstancedMesh>(null);
  const run = useRef({ t0: -1, covered: false, popped: [] as boolean[], done: false, drops: [] as Drop[], revealed: false, popPos: [] as { x: number; y: number; r: number }[] });
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const helpers = useMemo(
    () => ({ ray: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.8), ndc: new THREE.Vector2(), a: new THREE.Vector3(), b: new THREE.Vector3() }),
    [],
  );

  // Screen px → point on a plane just in front of the scene, and world units per px there.
  const place = (px: number, py: number, out: THREE.Vector3) => {
    const h = helpers;
    h.ndc.set((px / size.width) * 2 - 1, -(py / size.height) * 2 + 1);
    h.ray.setFromCamera(h.ndc, camera);
    h.ray.ray.intersectPlane(h.plane, out);
    return out;
  };
  const perPx = (px: number, py: number) => {
    place(px, py, helpers.a);
    place(px, py - 100, helpers.b);
    return helpers.a.distanceTo(helpers.b) / 100;
  };

  useFrame((state, delta) => {
    const r = run.current;
    const vw = size.width;
    const vh = size.height;
    uniforms.uDpr.value = dpr;
    uniforms.uViewH.value = vh;
    uniforms.uTime.value = state.clock.elapsedTime;

    if (introFx.t0 > 0 && r.t0 !== introFx.t0) {
      r.t0 = introFx.t0;
      r.covered = false;
      r.popped = PLAN.map(() => false);
      r.popPos = PLAN.map(() => ({ x: 0, y: 0, r: 0 }));
      r.done = false;
      r.drops = [];
      r.revealed = false;
    }

    const dm = drops.current;
    if (r.t0 < 0 || r.done) {
      uniforms.uActive.value = 0;
      bubbles.current.forEach((m) => m && (m.visible = false));
      if (dm) dm.count = 0;
      return;
    }

    uniforms.uActive.value = 1;
    if (!r.covered) {
      r.covered = true;
      introFx.onCover?.();
    }

    const t = performance.now() / 1000 - r.t0;
    const unit = Math.min(vw, vh);
    const diag = Math.hypot(vw, vh);
    const seeds = introFx.seeds;

    PLAN.forEach((P, i) => {
      const m = bubbles.current[i];
      const hole = uniforms.uHoles.value[i];
      const popAt = POP_AT[i];
      const seed = P.glyph >= 0 ? seeds[P.glyph] : undefined;
      if (P.glyph >= 0 && !seed) {
        if (m) m.visible = false;
        hole.set(0, 0, -1);
        return;
      }
      const R = P.r * unit;
      const tx = P.x * vw;
      const ty = P.y * vh;

      if (t < popAt) {
        // Start: the glyph itself, or just below the bottom edge.
        const sx0 = seed ? seed.x : tx + (((i * 53) % 7) - 3) * 12;
        const sy0 = seed ? seed.y : vh + R * 0.8;
        const r0 = seed ? seed.r * 1.1 : R * 0.4;
        const k = clamp01((t - P.start) / (popAt - P.start));
        const e = easeRise(k);
        // Sway like a real bubble: amplitude grows as it speeds up.
        const sway = Math.sin(t * 5.5 + i * 1.9) * 14 * Math.sin(k * Math.PI);
        const x = sx0 + (tx - sx0) * e + sway;
        const y = sy0 + (ty - sy0) * e;
        // Glyph bubbles pop out of their glyph with a jelly overshoot; all bubbles swell as they rise.
        const born = seed ? easeOutElastic(clamp01(t / INFLATE)) : clamp01(k * 3);
        const rad = (r0 + (R - r0) * e) * born;
        const wob = seed && t < INFLATE ? (1 - t / INFLATE) * Math.sin((t / INFLATE) * 14) * 0.16 : Math.sin(t * 8 + i) * 0.035;
        // A last-instant stretch right before bursting.
        const strain = clamp01((t - (popAt - 0.1)) / 0.1);
        const sx = 1 + wob + strain * 0.12;
        const sy = 1 - wob - strain * 0.04;
        if (m) {
          m.visible = rad > 0.5 && y < vh + rad * 2;
          place(x, y, m.position);
          const w = rad * perPx(x, y);
          m.scale.set(Math.max(w * sx, 1e-5), Math.max(w * sy, 1e-5), Math.max(w, 1e-5));
          m.rotation.y = t * 0.8 + i;
        }
        r.popPos[i] = { x, y, r: rad };
        hole.set(0, 0, -1);
        return;
      }

      // Popped: tear a hole where the bubble was, grow it fast.
      const at = r.popPos[i];
      if (!r.popped[i]) {
        r.popped[i] = true;
        if (!r.revealed) {
          r.revealed = true;
          introFx.onPop?.();
        }
        const count = 6 + Math.round(at.r / 12);
        for (let k = 0; k < count; k++) {
          const a = (k / count) * Math.PI * 2 + Math.random() * 0.4;
          const speed = 500 + Math.random() * 900 + at.r * 4;
          r.drops.push({ x: at.x + Math.cos(a) * at.r, y: at.y + Math.sin(a) * at.r, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 250, s: 3 + Math.random() * 6, born: t });
        }
      }
      if (m) m.visible = false;
      const p = clamp01((t - popAt) / HOLE_TIME);
      hole.set(at.x, at.y, at.r * 1.08 + (diag * 0.62 - at.r * 1.08) * easeOutExpo(p));
    });

    const sinceFirst = t - FIRST_POP;
    const sinceLast = t - LAST_POP;
    uniforms.uRim.value = sinceFirst < 0 ? 0 : Math.max(0, 1 - sinceFirst / (HOLE_TIME * 0.85));
    uniforms.uFlash.value = sinceFirst < 0 ? 0 : Math.max(0, 1 - sinceFirst / 0.35);

    // Droplets: burst out, slow, fall, shrink.
    if (dm) {
      const dt = Math.min(delta, 1 / 30);
      r.drops = r.drops.filter((d) => t - d.born < 1.1);
      r.drops.forEach((d, k) => {
        d.vx *= Math.exp(-3.2 * dt);
        d.vy = d.vy * Math.exp(-3.2 * dt) + 1500 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const life = 1 - (t - d.born) / 1.1;
        place(d.x, d.y, dummy.position);
        dummy.scale.setScalar(Math.max(d.s * life * perPx(d.x, d.y), 1e-5));
        dummy.updateMatrix();
        dm.setMatrixAt(k, dummy.matrix);
      });
      dm.count = Math.min(r.drops.length, 160);
      dm.instanceMatrix.needsUpdate = true;
    }

    if (sinceLast > HOLE_TIME) {
      r.done = true;
      uniforms.uActive.value = 0;
      PLAN.forEach((_, i) => uniforms.uHoles.value[i].set(0, 0, -1));
      introFx.onDone?.();
    }
  });

  return (
    <>
      {/* Drawn after the backdrop (opaque pass), so the glass bubbles refract the curtain itself. */}
      <mesh frustumCulled={false} renderOrder={900} material={materials.curtain}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh frustumCulled={false} renderOrder={2000} material={materials.rim}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      {PLAN.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            bubbles.current[i] = m;
          }}
          material={materials.bubble}
          visible={false}
          renderOrder={950}
        >
          <sphereGeometry args={[1, 48, 36]} />
        </mesh>
      ))}
      <instancedMesh ref={drops} args={[undefined, materials.drop, 160]} frustumCulled={false} renderOrder={960}>
        <sphereGeometry args={[1, 14, 10]} />
      </instancedMesh>
    </>
  );
}
