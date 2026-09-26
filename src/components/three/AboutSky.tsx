"use client";
/* eslint-disable react-hooks/immutability -- uniforms and buffers are driven imperatively every frame. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { about } from "@/lib/about";
import { stage } from "@/lib/stage";
import { createBubbleMaterial, createGlowMaterial } from "./materials";
import { moonShape, puffy, sparkleShape } from "./shapes";
import { world } from "./world";
import { FIGURES } from "./constellations";

// The About section's night sky: a planetarium around the camera (the day sky of the page turns to
// night behind it, see Backdrop). Each ability is a constellation of glass stars, its tools. Between two
// abilities the lines retract, the stars fly to their places in the next figure, flash as they land, and
// the new lines draw themselves in. Once drawn, every figure lives a little: the cube turns, the phone's
// button spins, sparks run through the network, the pickaxe mines, the paper plane bobs on its path.

const R = 20;
const BG = 4200;
const METEORS = 2;
const SPARKS = 4;
// How much of a morph the stars' departures are spread over (left to right, like a wave).
const STAGGER = 0.22;
const deg = THREE.MathUtils.degToRad;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Deterministic sky: same stars on every visit (and pure, for React).
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Direction on the sphere (camera space: -z is straight ahead, +x right, +y up).
function dir(az: number, el: number, out: THREE.Vector3) {
  const ce = Math.cos(el);
  return out.set(Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce);
}

// The cube's corners, turned and seen in perspective (chart x, y).
function cubePoint(x: number, y: number, z: number, yaw: number, pitch: number, out: [number, number]) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y1 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const persp = 1 / (1 + z2 * 0.28);
  out[0] = x1 * persp;
  out[1] = y1 * persp;
  return out;
}
const CUBE_PITCH = -0.5;

// The pickaxe's swing (radians around the end of the handle): a slow wind-up, a fast strike, a recoil.
const MINE = 2.6;
function mineAngle(t: number) {
  const p = (t % MINE) / MINE;
  if (p < 0.55) return 0.15 * easeInOut(p / 0.55);
  if (p < 0.62) {
    const q = (p - 0.55) / 0.07;
    return 0.15 - 0.21 * q * q;
  }
  const q = (p - 0.62) / 0.38;
  return -0.06 * Math.exp(-q * 5) * Math.cos(q * 12);
}

// ---------- Shaders ----------

const pointsVert = /* glsl */ `
  attribute float aMag;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uVis;
  uniform float uIgnite;
  uniform float uDpr;
  varying float vA;
  varying vec3 vC;
  varying float vBig;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.8 + 0.2 * sin(uTime * (0.8 + aSeed * 1.6) + aSeed * 41.0);
    // The sky switches on in a wave from the middle of the screen outward.
    float r = length(gl_Position.xy / gl_Position.w);
    float ig = smoothstep(r - 0.05, r + 0.25, uIgnite * 1.8);
    vA = aMag * tw * ig * uVis;
    vC = aColor;
    vBig = step(0.88, aMag);
    gl_PointSize = (1.3 + aMag * 2.4 + vBig * 8.0) * uDpr * (1.0 + (1.0 - ig) * 1.5);
  }
`;
const pointsFrag = /* glsl */ `
  varying float vA;
  varying vec3 vC;
  varying float vBig;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    float core = exp(-d * d * (vBig > 0.5 ? 30.0 : 6.0));
    float rays = vBig * (exp(-abs(p.x) * 34.0) * (1.0 - abs(p.y)) + exp(-abs(p.y) * 34.0) * (1.0 - abs(p.x))) * 0.8;
    float a = (core + rays) * vA;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vC * a, a);
  }
`;

// Crisp glowing line segments (instanced quads expanded in screen space), optionally dashed.
const lineVert = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec4 aStyle; // progress, alpha, half-width (px), dashed
  uniform vec2 uRes;
  varying vec2 vUv;
  varying float vA;
  varying float vD;
  varying float vDash;
  void main() {
    float prog = aStyle.x;
    vec3 e = mix(aStart, aEnd, prog);
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(e, 1.0);
    vec2 sa = a.xy / a.w;
    vec2 sb = b.xy / b.w;
    vec2 d = (sb - sa) * uRes;
    float len = length(d);
    vec2 dir = len > 0.001 ? d / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float t = position.x + 0.5;
    float side = position.y * 2.0;
    vec4 p = mix(a, b, t);
    vec2 off = nrm * side * aStyle.z + dir * (t * 2.0 - 1.0) * aStyle.z * 0.6;
    p.xy += off / uRes * 2.0 * p.w;
    gl_Position = p;
    vUv = vec2(t, side);
    vA = aStyle.y * step(0.0005, prog);
    // Distance from the start in px, so dashes stay put while the line grows.
    vD = t * len * 0.5;
    vDash = aStyle.w;
  }
`;
const lineFrag = /* glsl */ `
  varying vec2 vUv;
  varying float vA;
  varying float vD;
  varying float vDash;
  void main() {
    float d = abs(vUv.y);
    float core = exp(-d * d * 140.0);
    float glow = exp(-d * d * 9.0) * 0.2;
    float m = fract(vD / 16.0);
    float dash = mix(1.0, smoothstep(0.0, 0.06, m) * (1.0 - smoothstep(0.46, 0.52, m)), vDash);
    vec3 col = mix(vec3(0.7, 0.83, 1.0), vec3(1.0), core * 0.9);
    float a = (core + glow) * vA * dash;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a, a);
  }
`;

// 4-point flares behind the glass stars (and the pen tip, and the sparks).
const flareVert = /* glsl */ `
  attribute vec2 aFlare; // intensity, twist
  varying vec2 vUv;
  varying float vI;
  varying float vTw;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vI = aFlare.x;
    vTw = aFlare.y;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const flareFrag = /* glsl */ `
  varying vec2 vUv;
  varying float vI;
  varying float vTw;
  void main() {
    float c = cos(vTw), s = sin(vTw);
    vec2 p = mat2(c, -s, s, c) * vUv;
    float d = length(p);
    float halo = exp(-d * d * 6.0) * 0.45;
    float core = exp(-d * d * 70.0);
    float rays = exp(-abs(p.x) * 30.0) * pow(max(0.0, 1.0 - abs(p.y)), 3.0) + exp(-abs(p.y) * 30.0) * pow(max(0.0, 1.0 - abs(p.x)), 3.0);
    vec3 col = mix(vec3(0.86, 0.93, 1.0), vec3(1.0, 0.93, 0.8), smoothstep(0.0, 0.7, d)) + core;
    float a = (halo + rays * 0.9 + core) * vI;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a, a);
  }
`;

// Star slots shared by every figure, so one constellation can morph into the next. Each figure's stars
// are matched to the slots with the least total travel (optimal assignment, so paths don't cross); spare
// slots hide inside the nearest real star, and split out of it when the next figure needs them.
type Slots = { M: number; order: number[][]; real: boolean[][]; slotOf: number[][]; scatter: [number, number][] };

// Minimum-cost assignment for a square cost matrix (Hungarian algorithm). Returns the column per row.
function assign(cost: number[][]) {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = new Array<number>(n);
  for (let j = 1; j <= n; j++) out[p[j] - 1] = j - 1;
  return out;
}

function buildSlots(): Slots {
  const M = Math.max(...FIGURES.map((f) => f.stars.length));
  // Before the first constellation (and after the last) the stars are loose, scattered wide.
  const rnd = mulberry(77);
  const scatter: [number, number][] = Array.from({ length: M }, (_, k) => {
    const a = (k / M) * Math.PI * 2 + rnd() * 0.6;
    const r = 1.1 + rnd() * 0.9;
    return [Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.8];
  });
  const order: number[][] = [];
  const real: boolean[][] = [];
  const slotOf: number[][] = [];
  let prev = scatter.map((p) => [p[0], p[1]] as [number, number]);
  const tmp: [number, number] = [0, 0];
  FIGURES.forEach((f, fi) => {
    const pts = f.stars.map((st) => (f.kind === "cube" ? ([...cubePoint(st.p[0], st.p[1], st.p[2], fi * 1.1, CUBE_PITCH, tmp)] as [number, number]) : ([st.p[0], st.p[1]] as [number, number])));
    const n = pts.length;
    const d2 = (a: [number, number], b: [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    const nearest = (a: [number, number]) => pts.reduce((best, p, j) => (d2(a, p) < d2(a, pts[best]) ? j : best), 0);
    const cost = prev.map((a) => Array.from({ length: M }, (_, j) => (j < n ? d2(a, pts[j]) : d2(a, pts[nearest(a)]) + 0.05)));
    const cols = assign(cost);
    const ord: number[] = [];
    const re: boolean[] = [];
    const so: number[] = [];
    cols.forEach((j, k) => {
      const isReal = j < n;
      const si = isReal ? j : nearest(prev[k]);
      ord.push(si);
      re.push(isReal);
      if (isReal) so[si] = k;
    });
    order.push(ord);
    real.push(re);
    slotOf.push(so);
    prev = ord.map((si) => pts[si]);
  });
  return { M, order, real, slotOf, scatter };
}

// Does the segment (ax, ay)–(bx, by) touch the rectangle [x0, x1] × [y0, y1]? (Liang–Barsky clip)
function segmentHitsRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

type Label = { el: HTMLElement; hit: HTMLElement | null; fig: number; star: number; w: number; h: number; side: number; ox: number; oy: number };

export default function AboutSky() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const slots = useMemo(() => buildSlots(), []);
  const edgeBase = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const f of FIGURES) {
      out.push(n);
      n += f.edges.length;
    }
    out.push(n);
    return out;
  }, []);
  const nEdges = edgeBase[edgeBase.length - 1];
  // When (in edges drawn) each star lights up: as soon as the pen leaves it or arrives at it.
  const litAt = useMemo(
    () =>
      FIGURES.map((f) =>
        f.stars.map((_, si) => {
          let at = Infinity;
          f.edges.forEach(([a, b], ei) => {
            if (a === si) at = Math.min(at, ei);
            if (b === si) at = Math.min(at, ei + 1);
          });
          // A star without lines of its own (Flutter, inside its ring) lights up with the last one.
          return at === Infinity ? f.edges.length - 0.5 : at;
        }),
      ),
    [],
  );

  const assets = useMemo(() => {
    // Background stars: denser along a tilted milky band.
    const rnd = mulberry(1987);
    const pos = new Float32Array(BG * 3);
    const mag = new Float32Array(BG);
    const seed = new Float32Array(BG);
    const col = new Float32Array(BG * 3);
    const v = new THREE.Vector3();
    const palette = [new THREE.Color("#ffffff"), new THREE.Color("#ffffff"), new THREE.Color("#d8e6ff"), new THREE.Color("#fff1d9"), new THREE.Color("#ffe6f4")];
    for (let i = 0; i < BG; i++) {
      const band = i % 20 < 9;
      const az = rnd() * Math.PI * 2;
      const el = band ? Math.sin(az * 1.0 + 0.6) * 0.32 + (rnd() - 0.5) * 0.22 : Math.asin(rnd() * 1.7 - 0.85);
      dir(az, el, v).multiplyScalar(R * 1.4);
      pos.set([v.x, v.y, v.z], i * 3);
      const m = Math.pow(rnd(), 2.6);
      mag[i] = 0.18 + m * 0.82;
      seed[i] = rnd();
      const c = palette[Math.floor(rnd() * palette.length)];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    bgGeo.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));
    bgGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    bgGeo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: pointsVert,
      fragmentShader: pointsFrag,
      uniforms: { uTime: { value: 0 }, uVis: { value: 0 }, uIgnite: { value: 0 }, uDpr: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const makeLines = (count: number) => {
      const g = new THREE.InstancedBufferGeometry();
      const quad = new THREE.PlaneGeometry(1, 1);
      g.index = quad.index;
      g.setAttribute("position", quad.getAttribute("position"));
      g.setAttribute("uv", quad.getAttribute("uv"));
      g.setAttribute("aStart", new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aEnd", new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aStyle", new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.instanceCount = count;
      return g;
    };
    const lineUniforms = { uRes: { value: new THREE.Vector2(1, 1) } };
    const lineMat = new THREE.ShaderMaterial({
      vertexShader: lineVert,
      fragmentShader: lineFrag,
      uniforms: lineUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const edgeGeo = makeLines(nEdges);
    const trailGeo = makeLines(slots.M);
    const meteorGeo = makeLines(METEORS);

    // The milky way: a faint cool band behind everything.
    const nebulaGeo = new THREE.SphereGeometry(R * 1.6, 64, 32);
    const nebulaMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uVis: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uVis;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
        void main() {
          float az = atan(vDir.x, -vDir.z);
          float el = asin(clamp(vDir.y, -1.0, 1.0));
          float d = el - sin(az + 0.6) * 0.32;
          float band = exp(-d * d * 9.0);
          float n = fbm(vDir * 3.2 + vec3(0.0, 0.0, uTime * 0.01));
          float dust = smoothstep(0.45, 0.8, fbm(vDir * 7.0 - n * 1.4));
          vec3 col = mix(vec3(0.34, 0.46, 0.82), vec3(0.8, 0.86, 1.0), n);
          float a = (band * (0.06 + 0.16 * n) - dust * band * 0.05 + exp(-el * el * 2.0) * 0.012) * uVis;
          gl_FragColor = vec4(col * max(a, 0.0), max(a, 0.0));
        }
      `,
    });

    // Glass stars + their flares (+1 for the pen tip, + the sparks).
    const starGeo = puffy(sparkleShape(), 0.1, 0.12, 0.08);
    const starMat = createGlowMaterial("#dfe8ff", 0.35);
    const flareGeo = new THREE.PlaneGeometry(1, 1);
    flareGeo.setAttribute("aFlare", new THREE.InstancedBufferAttribute(new Float32Array((slots.M + 1 + SPARKS) * 2), 2).setUsage(THREE.DynamicDrawUsage));
    const flareMat = new THREE.ShaderMaterial({
      vertexShader: flareVert,
      fragmentShader: flareFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    return { bgGeo, bgMat, lineMat, lineUniforms, edgeGeo, trailGeo, meteorGeo, nebulaGeo, nebulaMat, starGeo, starMat, flareGeo, flareMat };
  }, [nEdges, slots]);

  useEffect(
    () => () => {
      assets.bgGeo.dispose();
      assets.bgMat.dispose();
      assets.lineMat.dispose();
      assets.edgeGeo.dispose();
      assets.trailGeo.dispose();
      assets.meteorGeo.dispose();
      assets.nebulaGeo.dispose();
      assets.nebulaMat.dispose();
      assets.starGeo.dispose();
      assets.starMat.dispose();
      assets.flareGeo.dispose();
      assets.flareMat.dispose();
    },
    [assets],
  );

  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const stars = useRef<THREE.InstancedMesh>(null);
  const flares = useRef<THREE.InstancedMesh>(null);
  const labels = useRef<Label[]>([]);
  const warm = useRef(0);
  const meteors = useRef(Array.from({ length: METEORS }, (_, i) => ({ t0: -9, next: 2 + i * 2.7, az: 0, el: 0, dir: 1 })));
  const tmp = useMemo(
    () => ({
      v: new THREE.Vector3(),
      w: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      e: new THREE.Euler(),
      s: new THREE.Vector3(),
      // Chart positions (x, y) per slot this frame (+ a moment ago, for the streaks).
      slot: new Float32Array(slots.M * 2),
      trail: new Float32Array(slots.M * 2),
      bright: new Float32Array(slots.M),
      moved: new Float32Array(slots.M),
      land: new Float32Array(slots.M),
      boost: new Float32Array(slots.M),
      world: new Float32Array(slots.M * 3),
      screen: new Float32Array(slots.M * 2),
      // Chart positions per figure-star for the two figures in play.
      fig: FIGURES.map((f) => new Float32Array(f.stars.length * 2)),
      look: new THREE.Matrix4(),
      up: new THREE.Vector3(0, 1, 0),
      zero: new THREE.Vector3(),
      pt: [0, 0] as [number, number],
    }),
    [slots],
  );

  useEffect(() => {
    labels.current = Array.from(document.querySelectorAll<HTMLElement>(".sky-label")).map((el) => ({
      el,
      hit: el.querySelector<HTMLElement>(".sky-hit"),
      fig: Number(el.dataset.fig),
      star: Number(el.dataset.star),
      w: 0,
      h: 0,
      side: 0,
      ox: NaN,
      oy: NaN,
    }));
    // Label sizes change with the viewport: measure again.
    const onResize = () => labels.current.forEach((l) => (l.w = l.h = 0));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useFrame((state, dtFrame) => {
    const g = root.current;
    const sp = spin.current;
    const st = stars.current;
    const fl = flares.current;
    if (!g || !sp || !st || !fl) return;
    const vis = about.vis;
    warm.current++;
    // Stay visible for the first frames so every shader here compiles with the rest of the scene.
    g.visible = vis > 0.001 || warm.current < 40;
    if (vis <= 0.001) {
      for (const l of labels.current) {
        l.el.style.opacity = "0";
        l.el.classList.remove("is-live", "is-hot");
      }
      about.pen.active = false;
      about.hover = "";
      if (!g.visible) return;
    }
    const t = state.clock.elapsedTime;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.updateMatrixWorld();

    const N = FIGURES.length;
    const M = slots.M;
    const focus = about.focus;
    const aspect = size.width / size.height;
    const halfV = deg((camera as THREE.PerspectiveCamera).fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const wide = size.width >= 900;
    // Where the constellation sits: right of the text on desktop, upper middle on phones.
    const offAz = wide ? Math.atan(0.3 * Math.tan(halfH)) : 0;
    const offEl = wide ? -deg(0.8) : Math.atan(0.3 * Math.tan(halfV));
    const S = Math.min(deg(10), wide ? halfH * 0.38 : halfH * 0.56);
    const px = reduced ? 0 : state.pointer.x;
    const py = reduced ? 0 : state.pointer.y;
    const small = size.width < 700;

    // The whole sky drifts a little as you go (depth), and leans toward the pointer.
    sp.rotation.set(-py * deg(0.8), -deg(focus * 9) - px * deg(1.2) - t * deg(0.15), 0);
    assets.bgMat.uniforms.uTime.value = t;
    assets.bgMat.uniforms.uVis.value = vis;
    assets.bgMat.uniforms.uIgnite.value = reduced ? 1 : smooth(0, 1, vis);
    assets.bgMat.uniforms.uDpr.value = dpr;
    assets.nebulaMat.uniforms.uTime.value = t;
    assets.nebulaMat.uniforms.uVis.value = vis;
    assets.lineUniforms.uRes.value.set(size.width, size.height);

    // ----- Shooting stars: now and then one streaks across the top of the sky -----
    {
      const ms = assets.meteorGeo.getAttribute("aStart") as THREE.InstancedBufferAttribute;
      const me = assets.meteorGeo.getAttribute("aEnd") as THREE.InstancedBufferAttribute;
      const mst = assets.meteorGeo.getAttribute("aStyle") as THREE.InstancedBufferAttribute;
      for (let i = 0; i < METEORS; i++) {
        const m = meteors.current[i];
        if (!reduced && t > m.next) {
          m.t0 = t;
          m.next = t + 7 + Math.random() * 9;
          m.az = deg(-30 + Math.random() * 60);
          m.el = deg(8 + Math.random() * 16);
          m.dir = Math.random() < 0.5 ? -1 : 1;
        }
        const u = (t - m.t0) / 0.9;
        const on = u >= 0 && u <= 1;
        const head = on ? u : 1;
        dir(m.az + m.dir * deg(head * 22), m.el - deg(head * 9), tmp.v).multiplyScalar(R * 1.1);
        dir(m.az + m.dir * deg(Math.max(0, head - 0.22) * 22), m.el - deg(Math.max(0, head - 0.22) * 9), tmp.w).multiplyScalar(R * 1.1);
        ms.setXYZ(i, tmp.w.x, tmp.w.y, tmp.w.z);
        me.setXYZ(i, tmp.v.x, tmp.v.y, tmp.v.z);
        mst.setXYZW(i, 1, on ? Math.sin(u * Math.PI) * 0.9 * vis : 0, 1.6, 0);
      }
      ms.needsUpdate = true;
      me.needsUpdate = true;
      mst.needsUpdate = true;
    }

    // ----- Which two figures are in play, and where each one is in its life -----
    // Before the first and after the last, the stars float free (figure -1 / N).
    const lo = Math.max(-1, Math.min(N - 1, Math.floor(focus)));
    const hi = Math.min(N, lo + 1);
    // Lines draw in once the stars have landed, and retract before they leave.
    const drawIn = (fi: number) => (reduced ? (Math.abs(focus - fi) < 0.5 ? 1 : 0) : smooth(fi - 0.27, fi - 0.03, focus));
    const retract = (fi: number) => (reduced ? 0 : smooth(fi + 0.06, fi + 0.2, focus));
    const u = focus - lo;
    const travel = reduced ? (u > 0.5 ? 1 : 0) : lo === hi ? 0 : clamp01((u - 0.2) / 0.56);
    tmp.boost.fill(0);

    // ----- Figures in their current pose -----
    const figPose = (fi: number) => {
      const f = FIGURES[fi];
      const out = tmp.fig[fi];
      const live = reduced ? 0 : 1;
      if (f.kind === "cube") {
        const yaw = fi * 1.1 + live * (t * 0.14 + (focus - fi) * 1.2);
        f.stars.forEach((star, si) => {
          cubePoint(star.p[0], star.p[1], star.p[2], yaw, CUBE_PITCH + live * Math.sin(t * 0.3) * 0.08, tmp.pt);
          out[si * 2] = tmp.pt[0];
          out[si * 2 + 1] = tmp.pt[1];
        });
        return;
      }
      if (f.kind === "pickaxe") {
        // Swings from the end of the handle; the tip flashes when it strikes.
        const a = live * mineAngle(t);
        const [pxv, pyv] = f.stars[9].p;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        f.stars.forEach((star, si) => {
          const dx = star.p[0] - pxv;
          const dy = star.p[1] - pyv;
          out[si * 2] = pxv + dx * ca - dy * sa;
          out[si * 2 + 1] = pyv + dx * sa + dy * ca;
        });
        const p = (t % MINE) / MINE;
        const k = slots.slotOf[fi][4];
        if (live && k !== undefined) tmp.boost[k] += Math.exp(-(((p - 0.62) / 0.025) ** 2)) * 1.2;
        return;
      }
      f.stars.forEach((star, si) => {
        let x = star.p[0];
        let y = star.p[1];
        if (live) {
          if (f.kind === "phone" && si >= 8) {
            // The keypad's round button turns like a click wheel.
            const a = t * 0.6;
            const dx = x;
            const dy = y + 0.44;
            x = dx * Math.cos(a) - dy * Math.sin(a);
            y = -0.44 + dx * Math.sin(a) + dy * Math.cos(a);
          } else if (f.kind === "network") {
            x += Math.sin(t * 0.7 + si * 1.9) * 0.012;
            y += Math.cos(t * 0.6 + si * 2.3) * 0.014;
          } else if (f.kind === "plane") {
            // The plane bobs; a ripple runs down its flight path.
            if (si >= 5) {
              x += Math.sin(t * 0.85) * 0.02;
              y += Math.sin(t * 1.7) * 0.04;
            } else {
              y += Math.sin(t * 1.7 - (5 - si) * 0.7) * 0.035 * (si / 5);
            }
          }
        }
        out[si * 2] = x;
        out[si * 2 + 1] = y;
      });
    };
    if (lo >= 0 && lo < N) figPose(lo);
    if (hi >= 0 && hi < N) figPose(hi);

    // Chart position of a slot in figure fi, and how bright it is there (the free-floating field for
    // fi = -1 / N: every star drifts on its own lazy path).
    const chartOf = (fi: number, k: number, out: [number, number]) => {
      if (fi < 0 || fi >= N) {
        const sc = slots.scatter[k];
        out[0] = sc[0] + (reduced ? 0 : Math.sin(t * (0.09 + (k % 5) * 0.017) + k * 1.7) * 0.28);
        out[1] = sc[1] + (reduced ? 0 : Math.cos(t * (0.07 + (k % 3) * 0.02) + k * 2.3) * 0.2);
        return 0.6;
      }
      const si = slots.order[fi][k];
      out[0] = tmp.fig[fi][si * 2];
      out[1] = tmp.fig[fi][si * 2 + 1];
      return slots.real[fi][k] ? 1 : 0;
    };
    const A: [number, number] = [0, 0];
    const B: [number, number] = [0, 0];
    // The morph: each star flies from its place in one figure to its place in the next, on a slight
    // bow, leaving left to right; it flashes as it lands.
    const place = (k: number, mt: number, out: Float32Array, main: boolean) => {
      const wA = chartOf(lo, k, A);
      const wB = chartOf(hi, k, B);
      const st = clamp01((B[0] + 1) / 2) * STAGGER;
      const raw = (mt - st) / (1 - STAGGER - 0.12);
      const e = easeInOutQuart(clamp01(raw));
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const bow = Math.sin(Math.PI * e) * 0.14;
      out[k * 2] = A[0] + dx * e - dy * bow;
      out[k * 2 + 1] = A[1] + dy * e + dx * bow;
      if (main) {
        tmp.bright[k] = wA * (1 - e) + wB * e;
        tmp.moved[k] = e;
        tmp.land[k] = travel > 0 && travel < 1 ? Math.exp(-(((raw - 1) / 0.08) ** 2)) * wB : 0;
      }
    };
    for (let k = 0; k < M; k++) {
      place(k, travel, tmp.slot, true);
      place(k, Math.max(0, travel - 0.07), tmp.trail, false);
    }

    const toSky = (x: number, y: number, out: THREE.Vector3) =>
      dir(offAz + x * S + px * deg(0.6), offEl + y * S + py * deg(0.4), out).multiplyScalar(R);
    for (let k = 0; k < M; k++) {
      toSky(tmp.slot[k * 2], tmp.slot[k * 2 + 1], tmp.v);
      tmp.world.set([tmp.v.x, tmp.v.y, tmp.v.z], k * 3);
    }

    // ----- Sparks: once a figure is complete, light runs along its flows -----
    const flareA = fl.geometry.getAttribute("aFlare") as THREE.InstancedBufferAttribute;
    {
      let fi = -1;
      let rest = 0;
      for (const f of [lo, hi]) {
        if (f < 0 || f >= N) continue;
        const r = drawIn(f) * (1 - retract(f));
        if (r > rest) {
          rest = r;
          fi = f;
        }
      }
      const flows = fi >= 0 && !reduced ? FIGURES[fi].flows ?? [] : [];
      const on = smooth(0.95, 1, rest) * vis;
      const count = Math.min(SPARKS, FIGURES[fi]?.kind === "network" ? 4 : flows.length);
      for (let i = 0; i < SPARKS; i++) {
        const idx = M + 1 + i;
        if (i >= count || on <= 0) {
          flareA.setXY(idx, 0, 0);
          tmp.m.makeScale(0, 0, 0);
          fl.setMatrixAt(idx, tmp.m);
          continue;
        }
        const path = flows[i % flows.length];
        const L = path.length - 1;
        const seg = FIGURES[fi].kind === "phone" ? 0.55 : 0.42;
        const T = L * seg;
        const cycle = T + (FIGURES[fi].kind === "phone" ? 1.6 : 0.9);
        const local = (t + (i * cycle) / count) % cycle;
        const endK = slots.slotOf[fi][path[L]];
        tmp.boost[endK] += Math.exp(-(((local - T) / 0.08) ** 2)) * 0.9 * on;
        if (local > T) {
          flareA.setXY(idx, 0, 0);
          continue;
        }
        const pos = local / seg;
        const j = Math.min(L - 1, Math.floor(pos));
        const fr = easeInOut(pos - j);
        const ka = slots.slotOf[fi][path[j]];
        const kb = slots.slotOf[fi][path[j + 1]];
        tmp.w.set(
          THREE.MathUtils.lerp(tmp.world[ka * 3], tmp.world[kb * 3], fr),
          THREE.MathUtils.lerp(tmp.world[ka * 3 + 1], tmp.world[kb * 3 + 1], fr),
          THREE.MathUtils.lerp(tmp.world[ka * 3 + 2], tmp.world[kb * 3 + 2], fr),
        );
        tmp.look.lookAt(tmp.zero, tmp.w, tmp.up);
        tmp.q.setFromRotationMatrix(tmp.look);
        tmp.s.setScalar(small ? 0.55 : 0.75);
        tmp.m.compose(tmp.w, tmp.q, tmp.s);
        fl.setMatrixAt(idx, tmp.m);
        flareA.setXY(idx, Math.pow(Math.sin((Math.PI * local) / T), 0.5) * 1.3 * on, t * 3 + i);
      }
    }

    // ----- Stars (glass + flare) -----
    const hoverSlot = new Set<number>();
    for (const fi of [lo, hi]) {
      if (fi < 0 || fi >= N) continue;
      FIGURES[fi].stars.forEach((s, si) => {
        if (s.label && about.hover === s.label) hoverSlot.add(slots.slotOf[fi][si]);
      });
    }
    const magOf = (fi: number, k: number) => {
      if (fi < 0 || fi >= N) return 0.45;
      const star = FIGURES[fi].stars[slots.order[fi][k]];
      return star.label ? star.mag : star.mag * 0.6;
    };
    for (let k = 0; k < M; k++) {
      const e = tmp.moved[k];
      const moving = Math.sin(e * Math.PI);
      const mag = magOf(lo, k) * (1 - e) + magOf(hi, k) * e;
      const hover = hoverSlot.has(k) ? 1 : 0;
      const land = tmp.land[k];
      const b = tmp.bright[k] * vis;
      const scale = (0.1 + mag * 0.17) * (0.35 + 0.65 * b) * (1 + hover * 0.5 + land * 0.45 + tmp.boost[k] * 0.25);
      tmp.v.set(tmp.world[k * 3], tmp.world[k * 3 + 1], tmp.world[k * 3 + 2]);
      tmp.look.lookAt(tmp.zero, tmp.v, tmp.up);
      tmp.q.setFromRotationMatrix(tmp.look);
      // A quarter turn on the way (the sparkle lands looking the same), a slow turn at rest.
      tmp.e.set(0, 0, t * 0.25 + k * 1.3 + e * Math.PI * 0.5);
      tmp.q.multiply(tmp.q2.setFromEuler(tmp.e));
      tmp.s.setScalar(Math.max(scale * Math.min(1, b * 3), 1e-4));
      tmp.m.compose(tmp.v, tmp.q, tmp.s);
      st.setMatrixAt(k, tmp.m);
      tmp.s.setScalar(Math.max(scale * (9 + land * 5), 1e-4));
      tmp.m.compose(tmp.v, tmp.q, tmp.s);
      fl.setMatrixAt(k, tmp.m);
      flareA.setXY(k, Math.min(1.9, b * (0.22 + mag * 0.55 + moving * 0.2 + hover * 0.9 + land * 1.1 + tmp.boost[k])), t * 0.2 + k);
    }

    // ----- Streaks while the stars travel -----
    {
      const ts = assets.trailGeo.getAttribute("aStart") as THREE.InstancedBufferAttribute;
      const te = assets.trailGeo.getAttribute("aEnd") as THREE.InstancedBufferAttribute;
      const tst = assets.trailGeo.getAttribute("aStyle") as THREE.InstancedBufferAttribute;
      for (let k = 0; k < M; k++) {
        toSky(tmp.trail[k * 2], tmp.trail[k * 2 + 1], tmp.w);
        ts.setXYZ(k, tmp.w.x, tmp.w.y, tmp.w.z);
        te.setXYZ(k, tmp.world[k * 3], tmp.world[k * 3 + 1], tmp.world[k * 3 + 2]);
        const moving = Math.sin(tmp.moved[k] * Math.PI);
        tst.setXYZW(k, 1, reduced ? 0 : moving * tmp.bright[k] * vis * 0.9, small ? 2.5 : 3.5, 0);
      }
      ts.needsUpdate = true;
      te.needsUpdate = true;
      tst.needsUpdate = true;
    }

    // ----- Constellation lines (only the figures in play) -----
    const eStart = assets.edgeGeo.getAttribute("aStart") as THREE.InstancedBufferAttribute;
    const eEnd = assets.edgeGeo.getAttribute("aEnd") as THREE.InstancedBufferAttribute;
    const eStyle = assets.edgeGeo.getAttribute("aStyle") as THREE.InstancedBufferAttribute;
    let penDone = false;
    about.pen.active = false;
    FIGURES.forEach((f, fi) => {
      const inPlay = fi === lo || fi === hi;
      const din = inPlay ? drawIn(fi) : 0;
      const rt = inPlay ? retract(fi) : 1;
      const E = f.edges.length;
      const drawn = din * E;
      // Retracting: every line slides back into its first star at once, quick and clean.
      const keep = 1 - rt * rt * (3 - 2 * rt);
      const alpha = vis * (1 - smooth(0.7, 1, rt)) * (din > 0 ? 1 : 0);
      f.edges.forEach(([a, b], ei) => {
        const k = edgeBase[fi] + ei;
        const prog = Math.min(reduced ? din : clamp01(drawn - ei), keep);
        const sa = slots.slotOf[fi][a];
        const sb = slots.slotOf[fi][b];
        eStart.setXYZ(k, tmp.world[sa * 3], tmp.world[sa * 3 + 1], tmp.world[sa * 3 + 2]);
        eEnd.setXYZ(k, tmp.world[sb * 3], tmp.world[sb * 3 + 1], tmp.world[sb * 3 + 2]);
        eStyle.setXYZW(k, prog, alpha, small ? 5 : 6.5, f.dashed?.includes(ei) ? 1 : 0);
        if (!penDone && rt <= 0 && din > 0.02 && prog > 0 && prog < 1) {
          penDone = true;
          tmp.w.set(
            THREE.MathUtils.lerp(tmp.world[sa * 3], tmp.world[sb * 3], prog),
            THREE.MathUtils.lerp(tmp.world[sa * 3 + 1], tmp.world[sb * 3 + 1], prog),
            THREE.MathUtils.lerp(tmp.world[sa * 3 + 2], tmp.world[sb * 3 + 2], prog),
          );
          tmp.look.lookAt(tmp.zero, tmp.w, tmp.up);
          tmp.q.setFromRotationMatrix(tmp.look);
          tmp.s.setScalar(1.1);
          tmp.m.compose(tmp.w, tmp.q, tmp.s);
          fl.setMatrixAt(M, tmp.m);
          flareA.setXY(M, 1.3 * vis, t * 2);
          const sc = tmp.w.clone().applyMatrix4(g.matrixWorld).project(camera);
          about.pen.x = ((sc.x + 1) / 2) * size.width;
          about.pen.y = ((1 - sc.y) / 2) * size.height;
          about.pen.active = true;
        }
      });
    });
    if (!penDone) flareA.setXY(M, 0, 0);
    st.instanceMatrix.needsUpdate = true;
    fl.instanceMatrix.needsUpdate = true;
    flareA.needsUpdate = true;
    eStart.needsUpdate = true;
    eEnd.needsUpdate = true;
    eStyle.needsUpdate = true;

    // ----- Labels ride on their stars, placed where they cross no line, star or other label -----
    const W = size.width;
    const Hh = size.height;
    const scr = tmp.screen;
    for (let k = 0; k < M; k++) {
      tmp.w.set(tmp.world[k * 3], tmp.world[k * 3 + 1], tmp.world[k * 3 + 2]).applyMatrix4(g.matrixWorld).project(camera);
      scr[k * 2] = ((tmp.w.x + 1) / 2) * W;
      scr[k * 2 + 1] = ((1 - tmp.w.y) / 2) * Hh;
    }
    // Lines that are (partly) drawn right now, in screen px.
    const segs: number[] = [];
    for (const fi of [lo, hi]) {
      if (fi < 0 || fi >= N) continue;
      const f = FIGURES[fi];
      const din = drawIn(fi);
      if (din <= 0.01) continue;
      const keep = 1 - smooth(0, 1, retract(fi));
      f.edges.forEach(([ea, eb], ei) => {
        const prog = Math.min(reduced ? din : clamp01(din * f.edges.length - ei), keep);
        if (prog <= 0) return;
        const sa = slots.slotOf[fi][ea];
        const sb = slots.slotOf[fi][eb];
        const x1 = scr[sa * 2];
        const y1 = scr[sa * 2 + 1];
        segs.push(x1, y1, x1 + (scr[sb * 2] - x1) * prog, y1 + (scr[sb * 2 + 1] - y1) * prog);
      });
    }
    const hitSeg = (x0: number, y0: number, x1: number, y1: number) => {
      let n = 0;
      for (let i = 0; i < segs.length; i += 4) if (segmentHitsRect(segs[i], segs[i + 1], segs[i + 2], segs[i + 3], x0, y0, x1, y1)) n++;
      return n;
    };
    const placed: number[] = [];
    let hovered = "";
    // Main tools claim their spot first.
    const order = labels.current.slice().sort((p, q) => Number(!!FIGURES[q.fig].stars[q.star].key) - Number(!!FIGURES[p.fig].stars[p.star].key));
    for (const l of order) {
      const f = FIGURES[l.fig];
      const inPlay = l.fig === lo || l.fig === hi;
      const din = inPlay ? drawIn(l.fig) : 0;
      const rt = inPlay ? retract(l.fig) : 1;
      // (Nothing is lit before the figure's first line starts.)
      const lit = reduced || din <= 0.001 ? din : clamp01((din * f.edges.length - litAt[l.fig][l.star] + 0.15) * 3);
      const hover = about.hover === f.stars[l.star].label && inPlay;
      const on = lit * (1 - smooth(0, 0.5, rt)) * vis;
      l.el.style.opacity = (hover ? Math.max(on, 0.9) : on).toFixed(3);
      l.el.classList.toggle("is-hot", hover);
      l.el.classList.toggle("is-live", on > 0.6);
      if (on <= 0.01) continue;
      const k = slots.slotOf[l.fig][l.star];
      const sx = scr[k * 2];
      const sy = scr[k * 2 + 1];
      if (!l.w) {
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
      const w = l.w;
      const h = l.h;
      const gap = 14;
      const cand: [number, number][] = [
        [gap, -h / 2],
        [-gap - w, -h / 2],
        [-w / 2, -gap - h],
        [-w / 2, gap],
        [gap - 2, -h - 4],
        [gap - 2, 4],
        [-gap - w + 2, -h - 4],
        [-gap - w + 2, 4],
      ];
      let best = 0;
      let bestCost = Infinity;
      cand.forEach(([ox, oy], ci) => {
        const x0 = sx + ox - 3;
        const y0 = sy + oy - 3;
        const x1 = x0 + w + 6;
        const y1 = y0 + h + 6;
        let cost = ci * 0.05 + (ci === l.side ? -0.6 : 0);
        cost += hitSeg(x0, y0, x1, y1) * 10;
        for (let j = 0; j < M; j++) {
          if (j === k || tmp.bright[j] < 0.5) continue;
          const qx = scr[j * 2];
          const qy = scr[j * 2 + 1];
          if (qx > x0 - 6 && qx < x1 + 6 && qy > y0 - 6 && qy < y1 + 6) cost += 4;
        }
        for (let p = 0; p < placed.length; p += 4) if (x0 < placed[p + 2] && x1 > placed[p] && y0 < placed[p + 3] && y1 > placed[p + 1]) cost += 12;
        if (x0 < 8 || x1 > W - 8 || y0 < 8 || y1 > Hh - 8) cost += 20;
        if (cost < bestCost) {
          bestCost = cost;
          best = ci;
        }
      });
      l.side = best;
      // Glide to the new spot instead of snapping (the cube turns, the pickaxe swings).
      const [tx, ty] = cand[best];
      if (!Number.isFinite(l.ox)) {
        l.ox = tx;
        l.oy = ty;
      }
      l.ox += (tx - l.ox) * Math.min(1, dtFrame * 14);
      l.oy += (ty - l.oy) * Math.min(1, dtFrame * 14);
      const lx = sx + l.ox;
      const ly = sy + l.oy;
      placed.push(lx, ly, lx + w, ly + h);
      l.el.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
      // The star itself is the hover target too: its hit area sits right on it.
      if (l.hit) l.hit.style.transform = `translate3d(${(-l.ox).toFixed(1)}px, ${(-l.oy).toFixed(1)}px, 0)`;
      // The hover card opens toward the roomier side.
      l.el.classList.toggle("is-flip", lx + w / 2 > W * 0.62);
      l.el.classList.toggle("is-up", ly > Hh * 0.62);
      if (on > 0.6 && l.el.matches(":hover")) hovered = f.stars[l.star].label ?? "";
    }
    // Hovering a star (or its name) makes it flare.
    about.hover = hovered;
  });

  return (
    <group ref={root}>
      <group ref={spin}>
        <mesh geometry={assets.nebulaGeo} material={assets.nebulaMat} frustumCulled={false} renderOrder={-910} />
        <points geometry={assets.bgGeo} material={assets.bgMat} frustumCulled={false} renderOrder={-900} />
      </group>
      <mesh geometry={assets.meteorGeo} material={assets.lineMat} frustumCulled={false} renderOrder={-885} />
      <mesh geometry={assets.trailGeo} material={assets.lineMat} frustumCulled={false} renderOrder={-884} />
      <mesh geometry={assets.edgeGeo} material={assets.lineMat} frustumCulled={false} renderOrder={-880} />
      <instancedMesh ref={flares} args={[assets.flareGeo, assets.flareMat, slots.M + 1 + SPARKS]} frustumCulled={false} renderOrder={-870} />
      <instancedMesh ref={stars} args={[assets.starGeo, assets.starMat, slots.M]} frustumCulled={false} />
      <SkyBubbles />
    </group>
  );
}

// Soap bubbles hanging in the night in front of the stars (the glass refracts the sky behind), and a
// crescent moon with its glow. They come and go with the stars. Pop a bubble and it re-inflates a moment
// later. x / y in half-widths / half-heights.
const SKY_BUBBLES: { x: number; y: number; z: number; r: number }[] = [
  { x: -0.18, y: 0.62, z: -8, r: 0.2 },
  { x: 0.9, y: -0.58, z: -10, r: 0.28 },
  { x: 0.95, y: 0.46, z: -7, r: 0.12 },
  { x: 0.12, y: -0.78, z: -12, r: 0.16 },
  { x: -0.4, y: 0.32, z: -9, r: 0.1 },
  { x: 0.5, y: 0.78, z: -6.5, r: 0.09 },
  { x: -0.93, y: 0.2, z: -11, r: 0.2 },
];

const haloMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uVis: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uVis;
      varying vec2 vUv;
      void main() {
        float d = length(vUv);
        float a = (exp(-d * d * 7.0) * 0.5 + exp(-d * d * 30.0) * 0.35) * uVis;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.84) * a, a);
      }
    `,
  });

function SkyBubbles() {
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);
  const material = useMemo(() => createBubbleMaterial(), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 48, 32), []);
  const moonGeo = useMemo(() => puffy(moonShape(), 0.2, 0.2, 0.12), []);
  const moonMat = useMemo(() => createGlowMaterial("#fff1d6", 0.18), []);
  const halo = useMemo(() => haloMaterial(), []);
  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
      moonGeo.dispose();
      moonMat.dispose();
      halo.dispose();
    },
    [material, geometry, moonGeo, moonMat, halo],
  );
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const moon = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const state = useRef(SKY_BUBBLES.map(() => ({ dead: 0, grow: 1, jig: 0, jigV: 0 })));
  const v = useMemo(() => new THREE.Vector3(), []);

  const pop = (i: number) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const m = meshes.current[i];
    const b = state.current[i];
    if (!m || b.dead > 0) return;
    m.getWorldPosition(v);
    world.pops.push({ pos: v.clone(), radius: SKY_BUBBLES[i].r * m.parent!.scale.x });
    b.dead = 1.6;
    b.grow = 0;
    document.body.style.cursor = "";
  };

  useFrame((frame, dt) => {
    const d = Math.min(dt, 1 / 30);
    const t = frame.clock.elapsedTime;
    const vis = about.vis;
    const moving = Math.abs(Math.sin((((about.focus % 1) + 1) % 1) * Math.PI));
    const halfV = Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2));
    const aspect = size.width / size.height;
    // Everything swells in (and shrinks away) with the same curve as the stars.
    const grow = vis * vis * (3 - 2 * vis);
    SKY_BUBBLES.forEach((c, i) => {
      const m = meshes.current[i];
      if (!m) return;
      const b = state.current[i];
      const depth = -c.z;
      const H = halfV * depth;
      const W = H * aspect;
      // Hover in place with a lazy bob.
      const y = c.y * H + Math.sin(t * 0.8 + i * 1.3) * 0.12;
      const x = c.x * W + Math.sin(t * 0.4 + i * 2.1) * 0.1;
      m.position.set(x, y, c.z);
      if (b.dead > 0) {
        b.dead -= d;
        m.visible = false;
        return;
      }
      b.grow = Math.min(1, b.grow + d * 1.4);
      b.jigV += (-b.jig * 120 - b.jigV * 6) * d + moving * 0.6 * d * 60 * 0.02;
      b.jig += b.jigV * d * 0.02;
      const wob = Math.sin(t * 2 + i) * 0.02 + b.jig;
      const inflate = 1 - Math.pow(1 - b.grow, 3);
      const sc = c.r * inflate * Math.max(grow, 1e-4);
      m.visible = vis > 0.01;
      m.scale.set(sc * (1 + wob), sc * (1 - wob), sc);
    });
    const mo = moon.current;
    const gl = glow.current;
    if (mo && gl) {
      const depth = 14;
      const H = halfV * depth;
      mo.visible = gl.visible = vis > 0.01;
      mo.position.set(-H * aspect * 0.62, H * 0.58 + Math.sin(t * 0.5) * 0.08, -depth);
      mo.rotation.set(Math.sin(t * 0.3) * 0.12, Math.sin(t * 0.22) * 0.3, 0.5 + Math.sin(t * 0.4) * 0.06);
      mo.scale.setScalar(0.72 * Math.max(grow, 1e-4));
      gl.position.set(mo.position.x, mo.position.y, -depth - 0.6);
      gl.scale.setScalar(4.2);
      halo.uniforms.uVis.value = grow;
      // Publish the seat in the middle of the crescent, in screen px: once night has fallen, the cat sits in it.
      if (mo.parent) {
        v.set(mo.position.x + 0.04 * grow, mo.position.y - 0.2 * grow, mo.position.z).applyMatrix4(mo.parent.matrixWorld).project(camera);
        stage.moon.x = ((v.x + 1) / 2) * size.width;
        stage.moon.y = ((1 - v.y) / 2) * size.height;
        stage.moon.valid = vis > 0.7;
      }
    }
  });

  return (
    <>
      {SKY_BUBBLES.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geometry}
          material={material}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
            state.current[i].jigV += 6;
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
          onClick={pop(i)}
        />
      ))}
      <mesh ref={glow} material={halo} renderOrder={-860}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={moon} geometry={moonGeo} material={moonMat} />
    </>
  );
}
