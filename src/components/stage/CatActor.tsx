"use client";
/* eslint-disable react-hooks/immutability -- the rig is driven imperatively every frame (uniforms, material, pose). */

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { stage } from "@/lib/stage";
import { about } from "@/lib/about";
import { catHeight, toWorld, unitsPerPx, view } from "./view";
import { dip, live, type Surface } from "./platforms";
import { STEP, heightAt, peakIn, surfaceAngle, toLocal, toScreen, walkAt } from "./terrain";
import { buildCatRig } from "./catRig";

// The cat. It lives on the page's real surfaces (letter tops included, see terrain.ts): every paw needs
// something under it, gaps and dips are jumped with proper ballistic hops that clear whatever is in
// between, narrow tops are perched on with the paws gathered, and on moving surfaces (the marquee, the
// sideways gallery) it runs along in the surface's own frame, so it can never slip or teleport.

const MODEL = "/models/cat.glb";
const SIDE = Math.PI / 2 - 0.28; // walking yaw: profile, turned a little toward the viewer
// Body landmarks along the spine (model units, +z = nose), measured on the model.
const FRONT_Z = 0.22;
const HIND_Z = -0.07;
const NOSE_Z = 0.5;
const RUMP_Z = -0.2;
const LAND_TIME = 0.22;

const clamp = THREE.MathUtils.clamp;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const damp = THREE.MathUtils.damp;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const approach = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  const d = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + d * (1 - Math.exp(-lambda * dt));
}

type Mode = "hidden" | "ground" | "air";
type AirKind = "hop" | "leap" | "fall" | "skim";

type Plan = { x1: number; T: number; vy0: number; y0: number; y1: number; prep: number; big: boolean };

function makeBrain() {
  return {
    mode: "hidden" as Mode,
    hiddenFor: 0,
    sid: "",
    lx: 0,
    // Facing along the surface's local x (+1 / -1) and walking speed (local px / s).
    dir: 1,
    v: 0,
    gather: 0,
    dwell: 0,
    // A hop waiting for its crouch to finish.
    plan: null as null | Plan,
    prep: 0,
    prepT: 0,
    air: {
      kind: "hop" as AirKind,
      t: 0,
      T: 0.5,
      x0: 0,
      y0: 0,
      x1: 0,
      vy0: 0,
      g: 3000,
      // leap: screen start + target
      fx: 0,
      fy: 0,
      h: 0,
      sx: 0,
      sy: 0,
      // fall
      vx: 0,
      vy: 0,
      // skim
      calm: 0,
    },
    // Screen-space state, kept in sync for everyone else.
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    goal: 0,
    nextWander: 0,
    stuck: 0,
    peek: 0,
    sniff: 0,
    faceDir: 0,
    target: -1,
    targetUntil: 0,
    zoom: false,
    catches: 0,
    yaw: 0,
    tumble: 0,
    tumbleV: 0,
    phase: 0,
    run: 0,
    gallop: 0,
    pitch: 0,
    land: 0,
    landAmt: 0,
    head: { yaw: 0, pitch: 0, roll: 0 },
    tiltUntil: 0,
    tiltTarget: 0,
    nextTilt: 3,
    ears: { l: 0, r: 0 },
    nextEar: 2,
    tail: { up: 0.3, amp: 0.15, speed: 1, phase: 0 },
    sit: 0,
    idleFor: 0,
    groom: 0,
    nextGroom: 8,
    pet: false,
    nextHeart: 0,
    pounce: -1,
    wiggle: 0,
    jelly: 0,
    jellyV: 0,
    breath: 0,
    turnStep: 0,
    stretch: 0,
    lookX: NaN,
    lookY: NaN,
    offFor: 0,
    why: "",
    swapAt: 0,
    lift: 0,
    legF: 0,
    legH: 0,
  };
}

export default function CatActor() {
  const gltf = useGLTF(MODEL);
  const { geometry, material, outline, modelH, uniforms, uOutline } = useMemo(() => buildCatRig(gltf.scene), [gltf]);

  const shadowTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(30,16,60,0.6)");
    grd.addColorStop(0.55, "rgba(30,16,60,0.25)");
    grd.addColorStop(1, "rgba(30,16,60,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const root = useRef<THREE.Group>(null);
  const yawG = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const brain = useRef(makeBrain());
  const tmp = useMemo(() => ({ a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }), []);

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
    brain.current.pet = true;
  };
  const onOut = () => {
    document.body.style.cursor = "";
    brain.current.pet = false;
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // The cat may be standing on a link (a project image): playing with it shouldn't navigate.
    e.nativeEvent.preventDefault();
    const b = brain.current;
    if (b.mode === "ground" && !b.plan && b.pounce < 0) b.pounce = 0;
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const t = state.clock.elapsedTime;
    const b = brain.current;
    const vw = view.vw;
    const vh = view.vh;
    const catH = catHeight(vw);
    const sf = catH / 100;
    const K = (catH / modelH) * 0.96; // px per model unit along the spine, seen in profile
    const catLen = (NOSE_Z - RUMP_Z) * K;
    const G = 3200 * sf;
    const list = live.list;
    const find = (id: string) => list.find((s) => s.id === id);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __cat: unknown }).__cat = { b, list, stage };

    let best: Surface | null = null;
    for (const s of list) if (s.valid && (!best || s.score > best.score)) best = s;
    const companion = (s: Surface) => s.kind === "track" || s.kind === "treadmill";
    // Local px per screen px (the marquee is scaled a touch).
    const scaleOf = (s: Surface) => Math.hypot(s.m.a, s.m.b) || 1;

    // ---------- Stance: where the paws go ----------
    // Paw offsets along the surface for a given facing (dir) and gather (0 = normal, 1 = bunched up).
    const paws = (dir: number, gather: number, yaw = SIDE) => {
      const s = Math.abs(Math.sin(yaw));
      return { f: dir * FRONT_Z * K * s * (1 - 0.6 * gather), h: -dir * -HIND_Z * K * s * (1 - 0.45 * gather) };
    };
    // Can the cat stand at lx facing dir? Returns the stance line height at lx, or NaN.
    const stanceAt = (s: Surface, lx: number, dir: number, gather: number) => {
      const p = paws(dir, gather);
      const yF = walkAt(s, lx + p.f);
      const yH = walkAt(s, lx + p.h);
      if (yF !== yF || yH !== yH) return NaN;
      const span = Math.abs(p.f - p.h);
      if (Math.abs(yF - yH) > span * 0.8 + 2) return NaN;
      const y = yH + ((yF - yH) * Math.abs(p.h)) / (span || 1);
      // Nothing may poke up through the belly, chest or chin.
      const belly = peakIn(s, lx + p.h, lx + p.f);
      if (belly === belly && belly < Math.min(yF, yH) - 0.1 * catH) return NaN;
      const ahead = peakIn(s, lx + p.f, lx + dir * NOSE_Z * K);
      if (ahead === ahead && ahead < y - 0.3 * catH) return NaN;
      const behind = peakIn(s, lx + dir * RUMP_Z * K, lx + p.h);
      if (behind === behind && behind < y - 0.22 * catH) return NaN;
      return y;
    };
    // Normal stance first; a narrow top can still be perched on with the paws gathered.
    const stand = (s: Surface, lx: number, dir: number, allowGather: boolean) => {
      const y = stanceAt(s, lx, dir, 0);
      if (y === y || !allowGather) return { y, g: 0 };
      return { y: stanceAt(s, lx, dir, 1), g: 1 };
    };
    // Can the paws simply walk from one spot to the next (no jump)?
    const stepOk = (y0: number, y1: number, dx: number) => y0 === y0 && y1 === y1 && Math.abs(y1 - y0) <= 0.03 * catH + Math.abs(dx) * 0.9;
    // The stretch you can walk along from lx without jumping, clipped to [lo, hi].
    const runExtent = (s: Surface, lx: number, lo: number, hi: number) => {
      const out = [lx, lx];
      for (const d of [-1, 1]) {
        let x = lx;
        let y = stanceAt(s, x, d, 0);
        while (y === y && (d < 0 ? x > lo : x < hi)) {
          const nx = x + d * STEP * 2;
          const ny = stanceAt(s, nx, d, 0);
          if (!stepOk(y, ny, STEP * 2)) break;
          x = nx;
          y = ny;
        }
        out[d < 0 ? 0 : 1] = x;
      }
      return out;
    };
    // Cats settle where the footing is flat: the levellest walkable spot near lx.
    const flattest = (s: Surface, lx: number, range: number) => {
      let best = lx;
      let score = Infinity;
      const y0 = stanceAt(s, lx, b.dir, 0);
      for (let x = lx - range; x <= lx + range; x += STEP * 2) {
        const p = paws(b.dir, 0);
        const yF = walkAt(s, x + p.f);
        const yH = walkAt(s, x + p.h);
        const y = stanceAt(s, x, b.dir, 0);
        if (y !== y || yF !== yF || yH !== yH || (y0 === y0 && !stepOk(y0, y, Math.abs(x - lx) * 3))) continue;
        const sc = Math.abs(yF - yH) + Math.abs(x - lx) * 0.03;
        if (sc < score) {
          score = sc;
          best = x;
        }
      }
      return best;
    };
    // Nearest spot to lx (either side) where the cat can stand.
    const nearestStand = (s: Surface, lx: number, range: number, dir: number) => {
      for (let d = 0; d <= range; d += STEP * 2) {
        for (const sgn of [1, -1]) {
          const x = lx + sgn * d;
          const r = stand(s, x, dir, true);
          if (r.y === r.y) return x;
          if (d === 0) break;
        }
      }
      return NaN;
    };
    const visibleRange = (s: Surface) => {
      toLocal(s, catLen * 0.7, vh / 2, tmp.a);
      const a = tmp.a.x;
      toLocal(s, vw - catLen * 0.7, vh / 2, tmp.a);
      return [Math.min(a, tmp.a.x), Math.max(a, tmp.a.x)];
    };

    // ---------- Jumps ----------
    // Ballistic hop along one surface from lx to x1: the arc clears everything in between.
    const arc = (s: Surface, lx: number, x1: number, dir: number, y0: number, y1: number, minH: number) => {
      const lo = Math.min(lx, x1) - Math.abs(RUMP_Z) * K * 0.5;
      const hi = Math.max(lx, x1) + NOSE_Z * K * 0.5;
      let apex = Math.min(y0, y1) - minH;
      const peak = peakIn(s, lo, hi);
      if (peak === peak) apex = Math.min(apex, peak - 0.14 * catH);
      // Check the path against the terrain; raise the apex until the whole body clears it.
      for (let k = 0; k < 5; k++) {
        const up = y0 - apex;
        const tu = Math.sqrt((2 * up) / G);
        const T = tu + Math.sqrt((2 * (y1 - apex)) / G);
        const vy0 = G * tu;
        let clash = 0;
        for (let i = 1; i < 12; i++) {
          const u = i / 12;
          const tt = u * T;
          const x = lx + (x1 - lx) * u;
          const y = y0 - vy0 * tt + 0.5 * G * tt * tt;
          const top = peakIn(s, x - Math.abs(HIND_Z) * K - 0.1 * catH, x + FRONT_Z * K + 0.12 * catH);
          if (top === top) clash = Math.max(clash, y - (top - 0.05 * catH));
        }
        if (clash <= 0) return { T, vy0 };
        apex -= clash + 4;
      }
      const up = y0 - apex;
      const tu = Math.sqrt((2 * up) / G);
      return { T: tu + Math.sqrt((2 * (y1 - apex)) / G), vy0: G * tu };
    };

    const planHop = (s: Surface, dir: number, speed: number, goal: number, running: boolean, lead: number): Plan | null => {
      const reach = (running ? 6 : 4.4) * catLen;
      let y0 = stanceAt(s, b.lx, dir, b.gather > 0.5 ? 1 : 0);
      if (y0 !== y0) y0 = stanceAt(s, b.lx, dir, 1);
      // The footing is going away under us (an image wiping shut): jump from where we physically are.
      if (y0 !== y0) y0 = toLocal(s, b.x, b.y, tmp.b).y;
      if (y0 !== y0) return null;
      // First find where walking stops working, then the first steady footing beyond it.
      const scan = (gather: number) => {
        let prev = y0;
        let blocked = false;
        for (let d = STEP * 2; d <= reach; d += STEP * 2) {
          const x = b.lx + dir * d;
          const y = stanceAt(s, x, dir, gather);
          if (!blocked) {
            if (!stepOk(prev, y, STEP * 2)) blocked = true;
            else prev = y;
            continue;
          }
          if (y !== y) continue;
          if (gather) return x;
          const y2 = stanceAt(s, x + dir * catH * 0.3, dir, 0);
          if (y2 === y2 && Math.abs(y2 - y) < 0.12 * catH) return x + dir * catH * 0.12;
        }
        return NaN;
      };
      let x1 = scan(0);
      if (x1 !== x1) x1 = scan(1);
      if (x1 !== x1) return null;
      // Running: land where we need to be at touchdown (a real bound), not just past the edge.
      if (running) {
        const want = goal + lead * 0.4;
        if ((want - x1) * dir > 0) {
          for (let x = b.lx + dir * Math.min(Math.abs(want - b.lx), reach); (x - x1) * dir > 0; x -= dir * STEP * 2) {
            const y = stanceAt(s, x, dir, 0);
            if (y === y && stepOk(y, stanceAt(s, x + dir * catH * 0.3, dir, 0), catH * 0.3)) {
              x1 = x;
              break;
            }
          }
        }
      }
      let y1 = stanceAt(s, x1, dir, 0);
      if (y1 !== y1) y1 = stanceAt(s, x1, dir, 1);
      if (y1 !== y1) return null;
      if (y0 - y1 > 4.8 * catH || y1 - y0 > 7 * catH) return null;
      const dist = Math.abs(x1 - b.lx);
      const minH = 0.1 * catH + dist * 0.07 + Math.max(0, y0 - y1) * 0.1;
      const { T, vy0 } = arc(s, b.lx, x1, dir, y0, y1, minH);
      const size = Math.max(dist / catLen, (y0 - y1) / catH);
      const big = !running && size > 1.6;
      const prep = running ? 0 : 0.14 + 0.22 * clamp(size - 0.6, 0, 1.6) + (big ? 0.45 : 0);
      return { x1, T, vy0, y0, y1, prep, big };
    };

    // The planned spot vanished under us (a letter re-animating, an image wiping shut): a small extra
    // hop to the nearest footing, starting from where we are in the air.
    const rescue = (s: Surface, lx: number, ly: number) => {
      const x = nearestStand(s, lx, catLen * 1.2, b.dir);
      if (x !== x) return false;
      const y1 = stand(s, x, b.dir, true).y;
      const { T, vy0 } = arc(s, lx, x, b.dir, ly, y1, 0.08 * catH);
      b.mode = "air";
      const a = b.air;
      a.kind = "hop";
      a.t = 0;
      a.T = T;
      a.x0 = lx;
      a.y0 = ly;
      a.x1 = x;
      a.vy0 = vy0;
      a.g = G;
      b.sid = s.id;
      b.lx = lx;
      return true;
    };

    const takeoff = (s: Surface, p: Plan) => {
      b.mode = "air";
      const a = b.air;
      a.kind = "hop";
      a.t = 0;
      a.T = p.T;
      a.x0 = b.lx;
      a.y0 = p.y0;
      a.x1 = p.x1;
      a.vy0 = p.vy0;
      a.g = G;
      b.sid = s.id;
      b.plan = null;
      b.prep = 0;
      b.sniff = 0;
      b.stretch = 1;
    };

    // Straight up (pounce / catching bubbles), carrying some of the walking speed along.
    const hopInPlace = (s: Surface, height: number) => {
      const y0 = stand(s, b.lx, b.dir, true).y;
      if (y0 !== y0) return false;
      const carry = clamp(b.v * 0.45, -300 * sf, 300 * sf);
      const tu = Math.sqrt((2 * height) / G);
      let x1 = b.lx + carry * tu * 2;
      if (stand(s, x1, b.dir, true).y !== stand(s, x1, b.dir, true).y) x1 = b.lx;
      const y1 = stand(s, x1, b.dir, true).y;
      const { T, vy0 } = arc(s, b.lx, x1, b.dir, y0, y1, height);
      b.plan = { x1, T, vy0, y0, y1, prep: 0.1, big: false };
      b.prep = 0.1;
      b.prepT = 0;
      return true;
    };

    // Jump to another surface (whose frame may be moving): aim at a live point on it.
    const leapTo = (s: Surface, lxTarget: number) => {
      const from = { x: b.x, y: b.y };
      b.mode = "air";
      const a = b.air;
      a.kind = "leap";
      a.t = 0;
      a.fx = from.x;
      a.fy = from.y;
      a.x1 = lxTarget;
      b.sid = s.id;
      const gy = stand(s, lxTarget, b.dir, true).y;
      toScreen(s, lxTarget, gy === gy ? gy : 0, tmp.b);
      const dist = Math.hypot(tmp.b.x - from.x, tmp.b.y - from.y);
      a.T = clamp(0.36 + dist / 3200, 0.4, 0.7);
      a.h = 45 * sf + Math.max(0, from.y - tmp.b.y) * 0.22 + dist * 0.06;
      b.plan = null;
      b.prep = 0;
      b.stretch = 1;
      b.dir = tmp.b.x >= from.x ? 1 : -1;
    };

    const landSpot = (s: Surface, fromX: number) => {
      toLocal(s, fromX, vh / 2, tmp.a);
      let want = tmp.a.x;
      if (s.kind === "perch") want = 0;
      else if (companion(s) && s.prefX === s.prefX) {
        toLocal(s, s.prefX, vh / 2, tmp.a);
        want = tmp.a.x;
      } else if (s.kind === "floor") want = clamp(fromX, catLen, vw - catLen);
      const [lo, hi] = visibleRange(s);
      if (s.kind !== "perch") want = clamp(want, lo, hi);
      const x = nearestStand(s, want, vw, b.dir);
      return x;
    };

    const land = (s: Surface, lx: number, speed: number) => {
      b.mode = "ground";
      b.sid = s.id;
      b.lx = lx;
      b.v = speed;
      b.dwell = 0.5;
      b.landAmt = clamp(Math.abs(b.vy) / 1400, 0.3, 1);
      b.land = LAND_TIME;
      b.tumbleV = 0;
      b.goal = lx;
      b.nextWander = t + rand(0.6, 1.8);
      b.stuck = 0;
      if (s.kind === "perch") b.nextWander = t + rand(1, 2);
      dip(s, lx, catLen * 0.8, 14 * b.landAmt);
    };

    const fall = (vx: number, vy: number) => {
      b.mode = "air";
      b.air.kind = "fall";
      b.air.vx = vx;
      b.air.vy = vy;
      b.air.calm = 0;
      b.plan = null;
      b.prep = 0;
    };

    const hide = () => {
      b.mode = "hidden";
      b.hiddenFor = 0;
      b.plan = null;
    };

    if (stage.catches !== b.catches) {
      b.catches = stage.catches;
      b.target = -1;
    }

    // ---------- Brain ----------
    let s: Surface | undefined = find(b.sid);
    let hopY = 0; // extra lift from the gait (gallop bounds, in px)

    switch (b.mode) {
      case "hidden": {
        b.hiddenFor += dt;
        if (!best || b.hiddenFor < 0.2) break;
        const lx = landSpot(best, best.kind === "floor" ? vw * rand(0.3, 0.7) : vw * 0.5);
        if (lx !== lx) break;
        const gy = stand(best, lx, 1, true).y;
        toScreen(best, lx, gy, tmp.b);
        if (best.kind === "perch" || tmp.b.y < vh * 0.45) {
          // Drop in from above, aimed at a live spot (it may be moving).
          b.x = clamp(tmp.b.x + rand(-60, 60), catLen, vw - catLen);
          b.y = -catH * 1.6;
          leapTo(best, lx);
          b.air.h = 10 * sf;
          b.air.T = clamp(0.35 + (tmp.b.y + catH) / 2600, 0.4, 0.75);
        } else {
          // Leap in from below the screen.
          b.x = clamp(tmp.b.x + rand(-80, 80), catLen, vw - catLen);
          b.y = vh + catH * 1.3;
          leapTo(best, lx);
          b.air.h += 80 * sf;
          b.air.T = Math.max(b.air.T, 0.7);
        }
        break;
      }

      case "air": {
        const a = b.air;
        const px = b.x;
        const py = b.y;
        if (a.kind === "hop" || a.kind === "skim") {
          if (!s) {
            fall(b.vx, b.vy);
            break;
          }
          if (!s.valid && best && best.id !== b.sid) {
            const lx = landSpot(best, b.x);
            if (lx === lx) {
              leapTo(best, lx);
              break;
            }
          }
          if (a.kind === "hop") {
            a.t += dt;
            const tt = Math.min(a.t, a.T);
            const lx = a.x0 + (a.x1 - a.x0) * (tt / a.T);
            const ly = a.y0 - a.vy0 * tt + 0.5 * a.g * tt * tt;
            b.lx = lx;
            toScreen(s, lx, ly, tmp.a);
            b.x = tmp.a.x;
            b.y = tmp.a.y;
            if (a.t >= a.T) {
              const r = stand(s, a.x1, b.dir, true);
              if (r.y === r.y) land(s, a.x1, companion(s) ? (a.x1 - a.x0) / a.T : 0);
              else if (!rescue(s, a.x1, ly)) fall((b.x - px) / dt, (b.y - py) / dt);
            }
          } else {
            // Skim: flying low over a surface that moves faster than any cat can run.
            const want = toLocal(s, s.prefX, vh / 2, tmp.a).x;
            const need = -s.vx / scaleOf(s);
            b.lx += need * dt + (want - b.lx) * Math.min(1, dt * 3);
            const top = peakIn(s, b.lx + HIND_Z * K * b.dir - 20, b.lx + NOSE_Z * K * b.dir);
            const target = (top === top ? top : a.y0) - 0.55 * catH;
            a.y0 = damp(a.y0, target, 10, dt);
            toScreen(s, b.lx, a.y0 + Math.sin(t * 9) * 3 * sf, tmp.a);
            b.x = tmp.a.x;
            b.y = tmp.a.y;
            a.calm = Math.abs(need) < 1300 * sf ? a.calm + dt : 0;
            if (a.calm > 0.18) {
              const x1 = nearestStand(s, b.lx + b.dir * catLen * 0.8, catLen * 3, b.dir);
              if (x1 === x1) {
                const y1 = stand(s, x1, b.dir, true).y;
                const { T, vy0 } = arc(s, b.lx, x1, b.dir, a.y0, y1, 0.05 * catH);
                a.kind = "hop";
                a.t = 0;
                a.T = T;
                a.x0 = b.lx;
                a.x1 = x1;
                a.vy0 = vy0;
                a.g = G;
              }
            }
          }
        } else if (a.kind === "leap") {
          if (!s) {
            fall(b.vx, b.vy);
            break;
          }
          if (!s.valid && best && best.id !== b.sid) {
            const lx = landSpot(best, b.x);
            if (lx === lx) {
              leapTo(best, lx);
              break;
            }
          }
          a.t += dt / a.T;
          const k = Math.min(a.t, 1);
          // Moving target (the sliding gallery, the marquee): keep aiming at the footing under our spot on screen.
          if (companion(s) && s.prefX === s.prefX && k < 0.85) {
            const want = toLocal(s, s.prefX, vh / 2, tmp.a).x;
            if (Math.abs(want - a.x1) > catLen * 0.4) {
              const x = nearestStand(s, want, catLen * 1.5, b.dir);
              if (x === x) {
                // Re-aim without a jolt: shift the start so the current point on the path stays put.
                const gOld = stand(s, a.x1, b.dir, true).y;
                toScreen(s, a.x1, gOld === gOld ? gOld : 0, tmp.b);
                const ox = tmp.b.x;
                const oy = tmp.b.y;
                const gNew = stand(s, x, b.dir, true).y;
                toScreen(s, x, gNew === gNew ? gNew : 0, tmp.b);
                const kk = Math.min(a.t, 0.85);
                a.fx -= ((tmp.b.x - ox) * kk) / (1 - kk);
                a.fy -= ((tmp.b.y - oy) * kk) / (1 - kk);
                a.x1 = x;
              }
            }
          }
          const gy = stand(s, a.x1, b.dir, true).y;
          toScreen(s, a.x1, gy === gy ? gy : heightAt(s, a.x1) || 0, tmp.a);
          b.x = a.fx + (tmp.a.x - a.fx) * k;
          b.y = a.fy + (tmp.a.y - a.fy) * k - a.h * 4 * k * (1 - k);
          if (k >= 1) {
            if (gy === gy) land(s, a.x1, 0);
            else {
              toLocal(s, b.x, b.y, tmp.a);
              if (!rescue(s, tmp.a.x, tmp.a.y)) fall((b.x - px) / dt, (b.y - py) / dt);
            }
          }
        } else {
          // Ballistic fall: land on whatever is under the paws — and after a moment of tumbling,
          // twist around and aim for the best surface in view instead of dropping out of the page.
          a.vy += G * dt;
          b.x += a.vx * dt;
          b.y += a.vy * dt;
          b.tumble += b.tumbleV * dt;
          a.calm += dt;
          if (best && a.calm > (Math.abs(b.tumbleV) > 0 ? 0.5 : 0.12)) {
            const lx = landSpot(best, clamp(b.x, 0, vw));
            if (lx === lx) {
              leapTo(best, lx);
              b.air.h = Math.max(12 * sf, -a.vy * 0.12);
              b.tumbleV = 0;
              break;
            }
          }
          if (a.vy > 0) {
            for (const c of list) {
              if (!c.valid) continue;
              toLocal(c, b.x, b.y, tmp.a);
              const r = stand(c, tmp.a.x, b.dir, true);
              if (r.y !== r.y) continue;
              toScreen(c, tmp.a.x, r.y, tmp.b);
              if (py <= tmp.b.y + 6 && b.y >= tmp.b.y) {
                b.y = tmp.b.y;
                land(c, tmp.a.x, 0);
                break;
              }
            }
          }
          if (b.mode === "air" && (b.y > vh + catH * 2.5 || b.x < -catLen * 2 || b.x > vw + catLen * 2)) hide();
        }
        if (b.mode === "air" && dt > 0) {
          b.vx = (b.x - px) / dt;
          b.vy = (b.y - py) / dt;
        }
        break;
      }

      case "ground": {
        // Never stranded: if the ground carried us off screen, leap back to somewhere visible.
        const off = b.x < -catLen * 0.6 || b.x > vw + catLen * 0.6 || b.y < -catH * 0.5 || b.y > vh + catH;
        b.offFor = off ? b.offFor + dt : 0;
        if (b.offFor > 0.3 && best && (best.id !== b.sid || companion(best))) {
          b.offFor = 0;
          const lx = landSpot(best, clamp(b.x, 0, vw));
          if (lx === lx) {
            leapTo(best, lx);
            break;
          }
        }
        if (!s) {
          fall(b.vx, -300);
          break;
        }
        if (!s.valid) {
          if (s.kind === "perch") {
            // The hero word just blew up: the cat flips off backwards to the left (still facing the word),
            // then heads for whatever comes next.
            b.dir = 1;
            b.tumbleV = rand(8, 10.5);
            fall(-rand(380, 470) * sf, -rand(880, 1000) * sf);
            break;
          }
          if (best) {
            const lx = landSpot(best, b.x);
            if (lx === lx) {
              leapTo(best, lx);
              break;
            }
          }
          // Nothing else in view: stay put and let the page carry us off screen (the watchdog brings
          // us back as soon as there's somewhere to go).
          if (b.offFor > 1.5) {
            hide();
            break;
          }
        }
        const surf = s;
        b.dwell -= dt;
        // About stage: the title swaps under our paws — spring up and let the new word arrive beneath.
        if (about.swap.at !== b.swapAt) {
          const fresh = performance.now() - about.swap.at < 250;
          b.swapAt = about.swap.at;
          if (surf.id === "stage" && fresh && !b.plan && b.pounce < 0 && hopInPlace(surf, catH * 1.45)) {
            b.plan!.prep = 0.06;
            b.sniff = 0;
          }
        }
        if (!b.plan && b.pounce < 0 && b.dwell <= 0 && best && best.id !== surf.id && best.score > surf.score + 0.3) {
          const lx = landSpot(best, b.x);
          if (lx === lx) {
            leapTo(best, lx);
            break;
          }
        }
        // Periodic surfaces: pick the copy of our spot nearest to where we are on screen.
        if (surf.period > 0) {
          const P = surf.period;
          toLocal(surf, b.x, b.y, tmp.a);
          b.lx += Math.round((tmp.a.x - b.lx) / P) * P;
        }

        // ----- Crouching for a planned hop -----
        if (b.plan) {
          b.prepT += dt;
          b.v = approach(b.v, 0, 4000 * sf * dt);
          if (b.prepT >= b.plan.prep) takeoff(surf, b.plan);
          else {
            const gy = stand(surf, b.lx, b.dir, true).y;
            if (gy === gy) {
              toScreen(surf, b.lx, gy, tmp.a);
              b.x = tmp.a.x;
              b.y = tmp.a.y;
            }
          }
          break;
        }

        // ----- What do I want? -----
        let goal = b.lx;
        let vmax = 120 * sf;
        let follow = false;
        let need = 0;
        const [vis0, vis1] = visibleRange(surf);

        switch (surf.kind) {
          case "perch":
            goal = 0;
            vmax = 200;
            // In the moon: face the stars and stay put. On the hero "o": now and then a little hop.
            if (surf.id === "moon") b.dir = 1;
            else if (t > b.nextWander && b.land <= 0) {
              hopInPlace(surf, rand(24, 40) * sf);
              b.nextWander = t + rand(5, 9);
            }
            break;
          case "treadmill":
          case "track": {
            follow = true;
            toLocal(surf, surf.prefX, b.y, tmp.a);
            goal = tmp.a.x;
            // Surface speed in its own frame: running against it keeps us in place on screen.
            need = -surf.vx / scaleOf(surf);
            break;
          }
          case "text":
          case "block": {
            if (t > b.nextWander || b.goal < vis0 - 1 || b.goal > vis1 + 1) {
              // Mostly stroll along the walkable stretch; now and then venture across a gap.
              const [ra, rb] = runExtent(surf, b.lx, vis0, vis1);
              const across = Math.random() < 0.22;
              const pick = across ? rand(vis0, vis1) : rand(ra, rb);
              const x = across ? nearestStand(surf, clamp(pick, vis0, vis1), catLen * 2, b.dir) : pick;
              b.goal = x === x ? flattest(surf, x, catLen * 0.35) : b.lx;
              b.nextWander = t + rand(4, 8);
            }
            goal = b.goal;
            vmax = 105 * sf;
            break;
          }
          case "floor": {
            const reach = catH * 2.4;
            const floorY = b.y;
            const reachable = (bb: (typeof stage.bubbles)[number]) => {
              const u = floorY - bb.y;
              return bb.alive && u > catH * 0.45 && u < reach + catH * 0.8;
            };
            let tgt = stage.bubbles.find((bb) => bb.id === b.target && reachable(bb)) ?? null;
            if (!tgt || t > b.targetUntil) {
              const candidates = stage.bubbles.filter(reachable);
              if (candidates.length) {
                const weights = candidates.map((bb) => 0.35 + (1 - (floorY - bb.y) / (reach + catH)) + Math.random() * 1.4);
                let pick = Math.random() * weights.reduce((acc, w) => acc + w, 0);
                tgt = candidates[candidates.length - 1];
                for (let k = 0; k < candidates.length; k++) {
                  pick -= weights[k];
                  if (pick <= 0) {
                    tgt = candidates[k];
                    break;
                  }
                }
                b.targetUntil = t + rand(2, 3.8);
              } else tgt = null;
            }
            const mf = catLen * 0.6;
            if (tgt) {
              b.target = tgt.id;
              b.sniff = 0;
              goal = tgt.x;
              vmax = 950 * sf;
              if (Math.abs(tgt.x - b.x) < catLen * 0.32 && b.land <= 0) hopInPlace(surf, clamp(floorY - tgt.y - catH * 0.78 + tgt.r * 0.3, 16, reach));
            } else if (stage.wand.active && stage.wand.y > floorY - catH * 4) {
              b.target = -1;
              b.sniff = 0;
              goal = stage.wand.x;
              vmax = 650 * sf;
              const wUp = floorY - stage.wand.y;
              if (Math.abs(stage.wand.x - b.x) < catLen * 0.3 && wUp < catH * 2.4 && wUp > catH * 0.5 && b.land <= 0 && t > b.nextWander) {
                hopInPlace(surf, clamp(wUp - catH * 0.7, 16, reach));
                b.nextWander = t + rand(0.6, 1.4);
              }
            } else {
              b.target = -1;
              if (t > b.nextWander && b.sniff <= 0) {
                const flowers = stage.flowerXs;
                if (flowers.length && Math.random() < 0.75) {
                  const fx = flowers[Math.floor(Math.random() * flowers.length)];
                  b.faceDir = fx > b.x ? 1 : -1;
                  b.goal = clamp(fx - b.faceDir * catLen * 0.45, mf, vw - mf);
                } else {
                  const far = Math.random() < 0.35;
                  b.goal = far ? (b.x < vw / 2 ? rand(vw * 0.7, vw - mf) : rand(mf, vw * 0.3)) : rand(mf, vw - mf);
                  b.faceDir = 0;
                  b.zoom = far;
                }
                b.nextWander = t + rand(2.5, 5.5);
              }
              goal = b.goal;
              if (b.zoom) {
                vmax = 720 * sf;
                if (Math.abs(goal - b.lx) < 10) b.zoom = false;
              }
              if (b.faceDir !== 0 && b.sniff <= 0 && Math.abs(goal - b.lx) < 5 && Math.abs(b.v) < 30) {
                b.sniff = 1.4;
                b.nextWander = t + rand(1.8, 3.5);
              }
            }
            goal = clamp(goal, mf, vw - mf);
            break;
          }
        }
        if (b.sniff > 0) {
          b.sniff -= dt;
          if (b.sniff <= 0) b.faceDir = 0;
          goal = b.lx;
        }
        if (b.pounce >= 0) goal = b.lx;

        // ----- Speed -----
        let want: number;
        if (follow) {
          want = need + clamp((goal - b.lx) * 3.2, -900 * sf, 900 * sf);
          if (Math.abs(need) < 8 && Math.abs(goal - b.lx) < catLen * 0.5) want = 0;
        } else {
          want = clamp((goal - b.lx) * 3.2, -vmax, vmax);
          if (Math.abs(goal - b.lx) < 3) want = 0;
        }
        // Legs have a top speed: faster than that the page simply carries us (and we jump back in).
        want = clamp(want, -1750 * sf, 1750 * sf);
        const accel = (follow ? 5200 : 1700) * sf;
        b.v = approach(b.v, want, accel * dt);
        if (Math.abs(b.v) > 12) {
          const d = b.v > 0 ? 1 : -1;
          // Turning around: cats don't moonwalk. Slow down, turn, then go.
          if (d !== b.dir) {
            b.dir = d;
            b.v *= 0.35;
          }
        }

        // ----- Move, or jump what's in the way -----
        if (Math.abs(b.v) > 1) {
          const d = b.v > 0 ? 1 : -1;
          const nx = b.lx + b.v * dt;
          const ok = stepOk(stand(surf, b.lx, d, false).y, stand(surf, nx, d, false).y, nx - b.lx);
          if (ok) {
            b.lx = nx;
            b.peek = 0;
            b.stuck = 0;
          } else {
            const pastEdge = (goal - b.lx) * d;
            const plan = pastEdge > catLen * 0.25 ? planHop(surf, d, Math.abs(b.v), goal, follow || Math.abs(b.v) > 200 * sf, need) : null;
            if (plan && (!follow || pastEdge > Math.abs(plan.x1 - b.lx) * 0.45 || Math.abs(need) > 60)) {
              b.plan = plan;
              b.prep = plan.prep;
              b.prepT = 0;
              b.lookX = plan.x1;
              if (plan.prep <= 0) {
                takeoff(surf, plan);
                break;
              }
            } else {
              // Edge with nothing worth jumping to: stop and peer over it.
              b.why = plan ? `cond ${Math.round(pastEdge)} ${Math.round(plan.x1 - b.lx)} ${Math.round(need)}` : pastEdge > catLen * 0.25 ? "noplan" : `near ${Math.round(pastEdge)}`;
              b.v = 0;
              b.stuck += dt;
              b.peek = b.stuck < 1.4 ? Math.min(1, b.peek + dt * 3) : Math.max(0, b.peek - dt * 2);
              if (b.stuck > 1.1) {
                const back = b.lx - d * catLen * 0.22;
                if (stand(surf, back, d, false).y === stand(surf, back, d, false).y) b.lx += (back - b.lx) * Math.min(1, dt * 2.5);
              }
              if (!follow && b.stuck > 1.2) {
                b.nextWander = t;
                b.stuck = 0;
              }
            }
          }
        }
        // Where we stand now (the ground may have moved under us: re-seat, or hop off).
        let r = stand(surf, b.lx, b.dir, true);
        if (r.y !== r.y) {
          // On the move: bound onward rather than being shoved around by a vanishing edge.
          const d = Math.abs(b.v) > 12 ? (b.v > 0 ? 1 : -1) : (goal - b.lx) >= 0 ? 1 : -1;
          const onward = follow || Math.abs(b.v) > 12 ? planHop(surf, d, Math.abs(b.v), goal, true, need) : null;
          if (onward) {
            b.dir = d;
            takeoff(surf, onward);
            break;
          }
          const x = nearestStand(surf, b.lx, catLen * 0.25, b.dir);
          if (x === x) {
            b.lx = x;
            r = stand(surf, x, b.dir, true);
          } else {
            toLocal(surf, b.x, b.y, tmp.a);
            if (!rescue(surf, b.lx, tmp.a.y)) fall(b.vx, -200);
            break;
          }
        }
        b.gather = damp(b.gather, r.g, 10, dt);
        toScreen(surf, b.lx, r.y, tmp.a);
        b.x = tmp.a.x;
        b.y = tmp.a.y;
        if (dt > 0) b.vx = b.v + surf.vx;
        b.vy = 0;
        break;
      }
    }

    if (b.x !== b.x || b.y !== b.y) {
      b.x = vw / 2;
      b.y = vh + catH * 2;
      hide();
    }

    // ---------- Pose ----------
    s = find(b.sid);
    const grounded = b.mode === "ground";
    const airborne = b.mode === "air";
    const speed = grounded && !b.plan ? Math.abs(b.v) : 0;
    const moving = speed > 12;

    // Pounce: crouch, wiggle, leap.
    let crouch = 0;
    if (b.pounce >= 0) {
      b.pounce += dt;
      crouch = Math.min(1, b.pounce / 0.18);
      if (b.pounce > 0.55 || !grounded) {
        b.pounce = -1;
        if (grounded && s && hopInPlace(s, Math.max(80, catH * 1.1))) {
          stage.bursts.push({ x: b.x, y: b.y - catH * 1.05, r: catH * 0.45, hearts: true });
        }
      }
    }
    if (b.plan) {
      const u = clamp(b.prepT / b.plan.prep, 0, 1);
      crouch = Math.max(crouch, Math.sin(Math.min(u * 1.25, 1) * Math.PI * 0.5));
    }
    const measuring = !!b.plan && b.plan.big && b.prepT > 0.12 && b.prepT < b.plan.prep - 0.08;
    b.wiggle = damp(b.wiggle, (b.pounce > 0.12 || measuring) ? 1 : 0, 14, dt);

    // Gait: walk → trot → rotary gallop (spine flexing, airborne between strides).
    const run = clamp(speed / (240 * sf), 0, 1);
    b.run = damp(b.run, moving ? run : 0, 8, dt);
    b.gallop = damp(b.gallop, smooth(380 * sf, 720 * sf, speed), 6, dt);
    const stride = 4 * 0.085 * Math.max(b.run, 0.45) * K;
    const walkRate = (speed / Math.max(stride, 1)) * Math.PI * 2;
    const gallopRate = Math.PI * 2 * (3.3 + clamp((speed - 720 * sf) / (1500 * sf), 0, 1) * 1.1);
    b.phase += (walkRate + (gallopRate - walkRate) * b.gallop) * dt;
    if (moving) hopY += b.gallop * Math.max(0, Math.sin(b.phase)) * 0.15 * catH;
    let sy = 1;
    let tuck = 0;
    let stretch = 0;
    if (grounded) {
      stretch = b.gallop * Math.sin(b.phase) * 0.9 - b.gather * 1;
      sy *= 1 + Math.sin(b.phase * 2) * 0.03 * b.run * (1 - b.gallop);
    } else if (airborne) {
      const a = b.air;
      if (a.kind === "hop") {
        const k = clamp(a.t / a.T, 0, 1);
        // Launch stretched, ball up over the top, reach for the landing.
        stretch = k < 0.3 ? 0.9 - k : k < 0.62 ? 0.6 - (k - 0.3) * 2.6 : -0.23 + (k - 0.62) * 2.2;
        tuck = Math.sin(k * Math.PI) * 0.8;
        sy = 1 + 0.1 * Math.sin(k * Math.PI);
      } else if (a.kind === "leap") {
        const k = clamp(a.t, 0, 1);
        stretch = k < 0.3 ? 0.9 - k : k < 0.62 ? 0.6 - (k - 0.3) * 2.6 : -0.23 + (k - 0.62) * 2.2;
        tuck = Math.sin(k * Math.PI);
        sy = 1 + 0.14 * Math.sin(k * Math.PI);
      } else if (a.kind === "skim") {
        stretch = 1;
        tuck = 0.15;
      } else {
        stretch = 0.3;
        tuck = 0.7;
      }
    }
    b.stretch = damp(b.stretch, stretch, 18, dt);

    if (b.land > 0) {
      if (b.land === LAND_TIME) b.jellyV += 7 * b.landAmt;
      b.land -= dt;
      const u = 1 - Math.max(b.land, 0) / LAND_TIME;
      sy *= 1 - 0.2 * b.landAmt * Math.sin(u * Math.PI);
    }
    b.jellyV += (-b.jelly * 260 - b.jellyV * 8.5) * dt;
    b.jelly += b.jellyV * dt;
    sy *= 1 + b.jelly * 0.07;
    sy *= 1 - crouch * 0.16;
    b.breath += dt * (b.sit > 0.5 ? 1.5 : 2.2) * (1 + b.run * 0.8);
    const breath = Math.sin(b.breath);
    if (b.pet && !moving) sy *= 1 + Math.sin(t * 60) * 0.004;
    const sxz = 1 / Math.sqrt(sy);

    // Idle life: sit down after a moment of calm, sometimes groom.
    const calm = grounded && !moving && !b.plan && b.pounce < 0 && !(s && companion(s) && Math.abs(s.vx) > 20);
    b.idleFor = calm ? b.idleFor + dt : 0;
    // (In the moon it sits and watches the constellations; on the narrow hero "o" it stays up.)
    const wantSit = b.idleFor > 2.4 && !b.pet && (s?.id === "moon" || (s?.kind !== "perch" && b.gather < 0.5)) ? 1 : 0;
    b.sit = damp(b.sit, wantSit, wantSit ? 2.6 : 12, dt);
    if (b.sit > 0.8 && t > b.nextGroom && b.groom <= 0) {
      b.groom = rand(2.2, 3.4);
      b.nextGroom = t + rand(9, 16);
    }
    if (b.groom > 0) b.groom = calm && b.sit > 0.5 ? b.groom - dt : 0;
    const grooming = b.groom > 0 ? smooth(0, 0.35, b.groom) : 0;

    // Facing: the body follows the walking direction; at rest it turns a little toward the pointer.
    // Idle gaze: the pointer, unless a constellation is being drawn overhead (then: that).
    const stargazing = about.pen.active && about.vis > 0.6 && !b.pet;
    const lookX = stargazing ? about.pen.x : view.pointerX;
    const lookY = stargazing ? about.pen.y : view.pointerY;
    const dx = lookX - b.x;
    const dy = lookY - (b.y - catH * 0.8);
    if (b.pet && Math.hypot(dx, dy) > catH * 1.6) b.pet = false;
    let face = b.yaw;
    if (grounded && b.sniff > 0 && b.faceDir !== 0) face = b.faceDir * SIDE;
    else if (b.plan || moving || (grounded && s && companion(s) && Math.abs(s.vx) > 20) || airborne) face = b.dir * SIDE;
    else if (grounded) face = b.gather > 0.5 ? b.dir * SIDE * 0.55 : clamp((dx / vw) * 1.3, -0.5, 0.5);
    const prevYaw = b.yaw;
    b.yaw = dampAngle(b.yaw, face, moving || airborne ? 9 : 3.5, dt);
    const turnRate = Math.abs(Math.atan2(Math.sin(b.yaw - prevYaw), Math.cos(b.yaw - prevYaw))) / Math.max(dt, 1e-3);
    b.turnStep = damp(b.turnStep, grounded ? clamp(turnRate / 1.2, 0, 1) : 0, 12, dt);
    b.phase += turnRate * dt * 4.5;

    // Head: watch the pointer, track the landing spot while measuring a jump, look down over edges.
    let hYaw = 0;
    let hPitch = 0;
    let hRoll = 0;
    if (b.plan && s) {
      const gy = stand(s, b.plan.x1, b.dir, true).y;
      toScreen(s, b.plan.x1, gy === gy ? gy : b.plan.y1, tmp.a);
      hPitch = clamp((tmp.a.y - (b.y - catH * 0.8)) / (Math.abs(tmp.a.x - b.x) + catH), -0.6, 0.6) * 0.8;
    } else if (grounded && !moving) {
      hYaw = clamp(Math.atan2(dx, catH * 2.2) - b.yaw, -0.45, 0.45);
      hPitch = clamp(dy / (vh * 0.45), -1, 1) * 0.16;
      if (t > b.nextTilt) {
        b.tiltTarget = (Math.random() < 0.5 ? -1 : 1) * rand(0.1, 0.18);
        b.tiltUntil = t + rand(0.9, 1.6);
        b.nextTilt = t + rand(3.5, 7);
      }
      if (t < b.tiltUntil) hRoll = b.tiltTarget;
      if (b.pet) {
        hRoll = Math.sin(t * 2.4) * 0.14;
        hPitch -= 0.06;
      }
      if (b.peek > 0) {
        hPitch = 0.34 * b.peek;
        hYaw *= 1 - b.peek;
      }
      if (grooming > 0) {
        hPitch = 0.3 + Math.sin(t * 7) * 0.06;
        hYaw = -0.25;
        hRoll = 0.12;
      }
    } else if (moving) {
      hPitch = Math.sin(b.phase * 2) * 0.04 * b.run * (1 - b.gallop) - b.gallop * 0.08;
      hYaw = -b.dir * 0.1 * (1 - b.run);
    } else {
      hPitch = clamp(b.vy * 0.00022, -0.2, 0.25);
    }
    if (b.sniff > 0) hPitch = 0.28;
    if (crouch > 0 && !b.plan) hPitch = -0.1;
    b.head.yaw = damp(b.head.yaw, hYaw, 6, dt);
    b.head.pitch = damp(b.head.pitch, hPitch, 6, dt);
    b.head.roll = damp(b.head.roll, hRoll, 4, dt);

    // Ears: random flicks, laid back while petted, pinned back at speed.
    if (t > b.nextEar) {
      if (Math.random() < 0.5) b.ears.l = 1;
      else b.ears.r = 1;
      if (Math.random() < 0.25) b.ears.l = b.ears.r = 1;
      b.nextEar = t + rand(1.5, 4.5);
    }
    const earRest = b.pet ? 0.45 : b.gallop > 0.5 || (airborne && b.air.kind === "skim") ? 0.8 : 0;
    b.ears.l = Math.max(earRest, b.ears.l * Math.exp(-dt * 9));
    b.ears.r = Math.max(earRest, b.ears.r * Math.exp(-dt * 9));

    // Tail: a rudder in the air, up and happy when walking, lashing while measuring a jump.
    let tUp = 0.3;
    let tAmp = 0.13;
    let tSpeed = 0.8;
    if (b.pet && !moving) {
      tUp = 1.2;
      tAmp = 0.07;
      tSpeed = 1.1;
    } else if (crouch > 0) {
      tUp = 0.12;
      tAmp = 0.22;
      tSpeed = 3.4;
    } else if (airborne) {
      tUp = b.air.kind === "skim" ? 0.25 : 0.55;
      tAmp = 0.06;
      tSpeed = 1.6;
    } else if (moving) {
      tUp = 0.9 - b.run * 0.45 - b.gallop * 0.3;
      tAmp = 0.05 + b.run * 0.03;
      tSpeed = 1.6 + b.run * 1.0 + b.gallop;
    } else if (b.gather > 0.5) {
      // Balancing on a narrow top: tail hangs down as a counterweight, twitching.
      tUp = -0.35;
      tAmp = 0.1;
      tSpeed = 1.4;
    } else if (b.sit > 0.5) {
      tUp = -0.05;
      tAmp = 0.08;
      tSpeed = 0.6;
    }
    b.tail.up = damp(b.tail.up, tUp, 5, dt);
    b.tail.amp = damp(b.tail.amp, tAmp, 5, dt);
    b.tail.speed = damp(b.tail.speed, tSpeed, 1.5, dt);
    b.tail.phase += b.tail.speed * dt;

    if (b.pet && grounded && t > b.nextHeart) {
      stage.bursts.push({ x: b.x + Math.sin(b.yaw) * catLen * 0.25, y: b.y - catH * 1.05, r: catH * 0.22, hearts: true });
      b.nextHeart = t + rand(0.8, 1.3);
    }

    // Body pitch: follow the ground under the paws (uneven letter tops), or the flight path.
    let pitch = 0;
    let stanceLift = 0;
    let legF = 0;
    let legH = 0;
    if (grounded && s) {
      const p = paws(b.dir, b.gather, b.yaw);
      const yF = walkAt(s, b.lx + p.f);
      const yH = walkAt(s, b.lx + p.h);
      const span = Math.abs(p.f - p.h);
      const ground = yF === yF && yH === yH && span > 4 ? Math.atan2(yF - yH, span) : 0;
      // Walking follows the ground; standing still keeps the body nearly level and reaches with the legs.
      const follows = 0.22 + 0.78 * clamp(speed / (70 * sf), 0, 1);
      const lean = clamp(ground * follows, -0.5, 0.5);
      const rest = Math.sin(ground) - Math.sin(lean);
      const pxPerUnit = catH / modelH;
      // The paw on the low side reaches down; the one on the high side would dig in, so lift the body.
      const front = Math.abs(p.f) * rest;
      const hind = -Math.abs(p.h) * rest;
      const lift = Math.max(0, -front, -hind);
      stanceLift = lift;
      legF = clamp((front + lift) / pxPerUnit, 0, 0.09);
      legH = clamp((hind + lift) / pxPerUnit, 0, 0.09);
      pitch = lean + Math.cos(b.phase) * 0.06 * b.run * (1 - b.gallop) + Math.cos(b.phase) * 0.1 * b.gallop - b.sit * 0.1 + crouch * 0.14;
      if (b.plan) pitch += clamp((b.plan.y1 - b.plan.y0) / (catH * 3), -0.25, 0.2);
    } else if (airborne) pitch = clamp(b.vy * 0.0004, -0.45, 0.45);
    b.pitch = damp(b.pitch, pitch, 12, dt);
    const waddle = Math.sin(b.phase) * 0.06 * b.run * (1 - b.gallop);

    const angle = s && (grounded || (airborne && b.air.kind !== "fall")) ? surfaceAngle(s) : 0;
    b.angle = damp(b.angle, angle, 10, dt);
    if (b.mode !== "air" || b.air.kind !== "fall") {
      const rest = Math.round(b.tumble / (Math.PI * 2)) * Math.PI * 2;
      b.tumble = damp(b.tumble, rest, 12, dt);
    }

    // ---------- Render ----------
    const feetX = b.x;
    b.lift = damp(b.lift, stanceLift, 10, dt);
    b.legF = damp(b.legF, legF, 10, dt);
    b.legH = damp(b.legH, legH, 10, dt);
    const feetY = b.y - hopY - b.lift;
    const r = root.current;
    const yg = yawG.current;
    const bd = body.current;
    if (r && yg && bd) {
      r.visible = b.mode !== "hidden";
      toWorld(feetX, feetY, r.position);
      const u = unitsPerPx(feetX, feetY);
      const scale = (catH * u) / modelH;
      r.rotation.z = -b.angle;
      yg.rotation.y = b.yaw;
      bd.position.y = (modelH / 2) * scale * sy;
      bd.rotation.set(b.pitch, 0, b.tumble + waddle);
      bd.scale.set(scale * sxz, scale * sy, scale * sxz);

      const sh = shadow.current;
      if (sh) {
        let gy = NaN;
        if (s && b.mode !== "hidden" && !(airborne && b.air.kind === "fall")) {
          toLocal(s, b.x, b.y, tmp.a);
          const h = heightAt(s, tmp.a.x);
          if (h === h) {
            toScreen(s, tmp.a.x, h, tmp.b);
            gy = tmp.b.y;
          }
        }
        sh.visible = r.visible && gy === gy;
        if (sh.visible) {
          toWorld(b.x, gy, sh.position);
          sh.position.z -= 0.25;
          const lift = clamp((gy - feetY) / (catH * 1.5), 0, 1);
          sh.scale.set(catLen * u * 0.95 * (1 - lift * 0.4) * (1 - b.gather * 0.35), catH * u * 0.22 * (1 - lift * 0.4), 1);
          sh.rotation.z = -b.angle;
          (sh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - lift * 0.7);
        }
      }
    }

    // About 2px of outline, whatever size the cat is on screen.
    uOutline.value = (modelH * 2.2) / catH;
    uniforms.uPhase.value = b.phase;
    uniforms.uRun.value = Math.max(b.run * (1 - b.gallop * 0.75), b.turnStep * 0.75);
    uniforms.uTuck.value = tuck;
    uniforms.uTime.value = t;
    uniforms.uHead.value.set(b.head.yaw, b.head.pitch, b.head.roll);
    uniforms.uEars.value.set(b.ears.l, b.ears.r);
    uniforms.uTail.value.set(b.tail.up, b.tail.amp, b.tail.phase);
    uniforms.uSit.value = b.sit;
    uniforms.uWiggle.value = b.wiggle;
    uniforms.uBreath.value = breath;
    uniforms.uStretch.value = b.stretch;
    uniforms.uLegs.value.set(b.legF, b.legH);
    uniforms.uPaw.value.set(grooming * (0.75 + Math.sin(t * 7.5) * 0.25), b.dir);

    // Publish for bubbles, charms, the garden and the debug overlay.
    const c = stage.cat;
    c.visible = b.mode !== "hidden";
    c.x = b.x;
    c.y = feetY;
    c.vx = b.vx;
    c.h = catH;
    c.airborne = airborne || hopY > 6;
    c.head.x = b.x + Math.sin(b.yaw) * catLen * 0.3;
    c.head.y = feetY - catH * 0.8;
    c.head.r = catH * 0.38;
  });

  return (
    <>
      <mesh ref={shadow} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={root} visible={false}>
        <group ref={yawG}>
          <group ref={body}>
            <mesh geometry={geometry} material={material} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} />
            <mesh geometry={geometry} material={outline} />
          </group>
        </group>
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
