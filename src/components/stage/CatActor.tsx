"use client";
/* eslint-disable react-hooks/immutability -- the rig is driven imperatively every frame (uniforms, material, pose). */

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { stage } from "@/lib/stage";
import { CAT_ASPECT, catHeight, toWorld, unitsPerPx, view } from "./view";
import { dip, live, surfaceY, type Platform } from "./platforms";
import { buildCatRig } from "./catRig";

const MODEL = "/models/cat.glb";
const GRAVITY = 2600;
const HOP_CROUCH = 0.09;
const HOP_LAND = 0.18;
const LAND_TIME = 0.22;
const SIDE = Math.PI / 2 - 0.28; // walking yaw: profile, turned a little toward the viewer

const clamp = THREE.MathUtils.clamp;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const damp = THREE.MathUtils.damp;

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  const d = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + d * (1 - Math.exp(-lambda * dt));
}

type State = "hidden" | "ground" | "jump" | "fall";

function makeBrain() {
  return {
    state: "hidden" as State,
    hiddenFor: 0,
    plat: "",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    w: 0,
    // Position along the current platform (px from its left edge), so riding a moving surface never slips.
    local: 0,
    // Seconds to stay put after landing before hopping to another platform.
    dwell: 0,
    j: { t: 0, T: 0.6, fx: 0, fy: 0, id: "", off: 0, ax: 0, h: 80 },
    yaw: 0,
    tumble: 0,
    tumbleV: 0,
    phase: 0,
    run: 0,
    hopT: -1,
    hopH: 0,
    hopAir: 0.4,
    hopLanded: false,
    hopQueue: 0,
    nextHop: 3,
    goal: 0,
    nextWander: 0,
    sniff: 0,
    faceDir: 1,
    target: -1,
    targetUntil: 0,
    zoom: false,
    catches: 0,
    pitch: 0,
    tilt: 0,
    land: 0,
    landAmt: 0,
    // Soft-rig pose (all damped toward targets each frame).
    head: { yaw: 0, pitch: 0, roll: 0 },
    tiltUntil: 0,
    tiltTarget: 0,
    nextTilt: 3,
    ears: { l: 0, r: 0 },
    nextEar: 2,
    // phase is integrated here (not time × speed) so tempo changes never make the tail whip.
    tail: { up: 0.3, amp: 0.15, speed: 1, phase: 0 },
    sit: 0,
    idleFor: 0,
    // Petting (hover) and pouncing (click).
    pet: false,
    nextHeart: 0,
    pounceT: -1,
    wiggle: 0,
    // Chonky jiggle after landings.
    jelly: 0,
    jellyV: 0,
    breath: 0,
    turnStep: 0,
  };
}

export default function CatActor() {
  const gltf = useGLTF(MODEL);

  const { geometry, material, modelH, uniforms } = useMemo(() => buildCatRig(gltf.scene), [gltf]);

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

  const startHop = (h: number) => {
    const b = brain.current;
    if (b.hopT >= 0 || b.state !== "ground") return false;
    b.hopT = 0;
    b.hopH = h;
    b.hopAir = clamp(0.3 + h / 650, 0.32, 0.8);
    b.hopLanded = false;
    return true;
  };

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
    // The cat may be sitting on a link (a project image): playing with it shouldn't navigate.
    e.nativeEvent.preventDefault();
    const b = brain.current;
    // Pounce: crouch + butt wiggle first, the leap follows (see the pose section).
    if (b.state === "ground" && b.hopT < 0 && b.pounceT < 0) b.pounceT = 0;
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const t = state.clock.elapsedTime;
    const b = brain.current;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __cat: unknown }).__cat = { b, list: live.list, stage };
    const vw = view.vw;
    const vh = view.vh;
    const catH = catHeight(vw);
    const catLen = catH * CAT_ASPECT;
    const m = catLen * 0.42;
    // On the open floor keep the whole cat (tail included) on screen.
    const mf = catLen * 0.58;
    const sf = catH / 90;
    const list = live.list;
    const find = (id: string) => list.find((p) => p.id === id);

    let best: Platform | null = null;
    for (const p of list) if (p.valid && (!best || p.score > best.score)) best = p;

    const clampIn = (x: number, p: Platform) => (p.x1 - p.x0 < 2 * m ? (p.x0 + p.x1) / 2 : clamp(x, p.x0 + m, p.x1 - m));
    const chooseLandX = (p: Platform, fromX: number) => {
      switch (p.kind) {
        case "perch":
          return p.cx;
        case "track":
          return clampIn(vw * 0.42, p);
        case "treadmill":
          return clamp(fromX, vw * 0.3, vw * 0.7);
        case "floor":
          return clamp(fromX, mf, vw - mf);
        default:
          return clampIn(fromX, p);
      }
    };
    const liveLandX = (p: Platform) => {
      if (p.kind === "perch") return p.cx;
      if (p.kind === "track") return p.x0 + b.j.off;
      if (p.kind === "vertical") return clampIn(b.j.ax, p);
      return b.j.ax;
    };
    const jumpTo = (p: Platform) => {
      const lx = chooseLandX(p, b.x);
      const ly = surfaceY(p, lx);
      const dist = Math.hypot(lx - b.x, ly - b.y);
      b.state = "jump";
      b.j = {
        t: 0,
        T: clamp(0.36 + dist / 2600, 0.38, 0.8),
        fx: b.x,
        fy: b.y,
        id: p.id,
        off: lx - p.x0,
        ax: lx,
        h: 55 * sf + Math.max(0, b.y - ly) * 0.22 + dist * 0.1,
      };
      b.hopT = -1;
      b.sniff = 0;
    };
    const land = (p: Platform) => {
      b.state = "ground";
      b.plat = p.id;
      b.y = surfaceY(p, b.x);
      b.local = b.x - p.x0;
      b.dwell = 0.35;
      b.landAmt = clamp(Math.abs(b.vy) / 1500, 0.35, 1);
      b.land = LAND_TIME;
      b.w = 0;
      b.vx = 0;
      b.vy = 0;
      b.tumbleV = 0;
      b.goal = b.x;
      b.nextWander = t + rand(0.8, 2);
      if (p.kind === "perch") b.hopQueue = 2;
      dip(p.id, b.x, catLen * 0.95, 16 * b.landAmt);
    };
    const hide = () => {
      b.state = "hidden";
      b.hiddenFor = 0;
      b.hopT = -1;
    };

    // Cheer after catching a bubble.
    if (stage.catches !== b.catches) {
      b.catches = stage.catches;
      b.target = -1;
      if (b.state === "ground") b.hopQueue = Math.max(b.hopQueue, 1);
    }

    switch (b.state) {
      case "hidden": {
        b.hiddenFor += dt;
        if (best && b.hiddenFor > 0.35) {
          const lx = chooseLandX(best, best.kind === "floor" ? vw * rand(0.3, 0.7) : best.cx);
          if (best.kind === "perch" || surfaceY(best, lx) < vh * 0.45) {
            // Drop in from above.
            b.x = lx;
            b.y = -catH * 1.6;
            b.vx = 0;
            b.vy = 200;
            b.state = "fall";
          } else {
            // Leap in from below the screen.
            b.x = clamp(lx + rand(-80, 80), m, vw - m);
            b.y = vh + catH * 1.3;
            jumpTo(best);
            b.j.h += 80 * sf;
            b.j.T = Math.max(b.j.T, 0.7);
          }
        }
        break;
      }

      case "jump": {
        const j = b.j;
        const p = find(j.id);
        if (!p || !p.valid) {
          // Target vanished mid-air: retarget or keep flying ballistically.
          if (best && best.id !== j.id) jumpTo(best);
          else b.state = "fall";
          break;
        }
        j.t += dt / j.T;
        const k = Math.min(j.t, 1);
        const tx = liveLandX(p);
        const ty = surfaceY(p, tx);
        const nx = j.fx + (tx - j.fx) * k;
        const ny = j.fy + (ty - j.fy) * k - j.h * 4 * k * (1 - k);
        b.vx = (nx - b.x) / dt;
        b.vy = (ny - b.y) / dt;
        b.x = nx;
        b.y = ny;
        if (k >= 1) land(p);
        break;
      }

      case "fall": {
        b.vy += GRAVITY * dt;
        const prevY = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.tumble += b.tumbleV * dt;
        if (b.vy > 0) {
          for (const p of list) {
            if (!p.valid) continue;
            const py = surfaceY(p, b.x);
            if (prevY <= py + 4 && b.y >= py && b.x >= p.x0 && b.x <= p.x1) {
              b.y = py;
              land(p);
              break;
            }
          }
        }
        if (b.state === "fall" && (b.y > vh + catH * 2.5 || b.x < -catLen * 2 || b.x > vw + catLen * 2)) hide();
        break;
      }

      case "ground": {
        const p = find(b.plat);
        const midHop = b.hopT >= 0;
        if (!p || !p.valid) {
          if (p?.kind === "perch") {
            // The hero word just blew up: launch the cat with it.
            b.state = "fall";
            b.vx = stage.perch.vx * 0.5 + rand(-260, 260);
            b.vy = Math.min(stage.perch.vy, 0) * 0.5 - rand(900, 1150);
            b.tumbleV = rand(7, 11) * (Math.random() < 0.5 ? -1 : 1);
          } else if (best) jumpTo(best);
          else {
            b.state = "fall";
            b.vx = b.w;
            b.vy = -300;
          }
          break;
        }
        b.dwell -= dt;
        if (!midHop && b.dwell <= 0 && best && best.id !== p.id && best.score > p.score + 0.3) {
          jumpTo(best);
          break;
        }

        let goal = b.x;
        let vmax = 240 * sf;
        let runMax = 900 * sf;
        let ride = false;
        const hopReady = b.hopT < 0 && b.land <= 0;

        switch (p.kind) {
          case "perch":
            goal = p.cx;
            vmax = 500;
            if (hopReady && b.hopQueue > 0) {
              if (startHop(rand(30, 46) * sf)) b.hopQueue--;
            } else if (hopReady && t > b.nextHop) {
              startHop(rand(22, 40) * sf);
              b.nextHop = t + rand(5, 9);
            }
            break;
          case "vertical":
            if (t > b.nextWander) {
              b.goal = p.x1 - p.x0 > 2 * m ? rand(p.x0 + m, p.x1 - m) : p.cx;
              b.nextWander = t + rand(3, 7);
            }
            goal = b.goal;
            if (hopReady && b.hopQueue > 0) {
              if (startHop(rand(26, 38) * sf)) b.hopQueue--;
            } else if (hopReady && Math.abs(b.w) < 20 && t > b.nextHop) {
              startHop(rand(18, 30) * sf);
              b.nextHop = t + rand(6, 11);
            }
            break;
          case "track":
            // Ride the gallery like a moving walkway; only stroll back if it carried us too far left.
            if (b.x < vw * 0.22) {
              goal = vw * 0.42;
              vmax = 300 * sf;
              runMax = 380 * sf;
            } else ride = true;
            break;
          case "treadmill":
            goal = vw * 0.56;
            vmax = 600 * sf;
            runMax = 1700 * sf;
            break;
          case "floor": {
            const reach = catH * 2.4;
            const reachable = (bb: (typeof stage.bubbles)[number]) => {
              const u = p.y - bb.y;
              return bb.alive && u > catH * 0.45 && u < reach + catH * 0.8;
            };
            // Stick with the chosen bubble for a while; then pick again from ALL reachable bubbles,
            // weighted toward low ones about to land but with plenty of randomness (so it crosses the garden).
            let tgt = stage.bubbles.find((bb) => bb.id === b.target && reachable(bb)) ?? null;
            if (!tgt || t > b.targetUntil) {
              const candidates = stage.bubbles.filter(reachable);
              if (candidates.length) {
                const weights = candidates.map((bb) => 0.35 + (1 - (p.y - bb.y) / (reach + catH)) + Math.random() * 1.4);
                let pick = Math.random() * weights.reduce((a, w) => a + w, 0);
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
            const up = tgt ? p.y - tgt.y : 0;
            if (tgt) {
              // Chase the bubble and leap for it.
              b.target = tgt.id;
              b.sniff = 0;
              goal = tgt.x;
              vmax = 950 * sf;
              runMax = 1100 * sf;
              if (Math.abs(tgt.x - b.x) < catLen * 0.32 && hopReady) {
                startHop(clamp(up - catH * 0.78 + tgt.r * 0.3, 16, reach));
              }
            } else if (stage.wand.active && stage.wand.y > p.y - catH * 4) {
              // No bubbles in reach: stalk the wand instead.
              b.target = -1;
              b.sniff = 0;
              goal = stage.wand.x;
              vmax = 650 * sf;
              const wUp = p.y - stage.wand.y;
              if (Math.abs(stage.wand.x - b.x) < catLen * 0.3 && wUp < catH * 2.4 && wUp > catH * 0.5 && hopReady && t > b.nextHop) {
                startHop(clamp(wUp - catH * 0.7, 16, reach));
                b.nextHop = t + rand(0.6, 1.4);
              }
            } else {
              // Stroll around the garden and sniff the flowers.
              b.target = -1;
              if (t > b.nextWander && b.sniff <= 0) {
                const flowers = stage.flowerXs;
                if (flowers.length && Math.random() < 0.75) {
                  const fx = flowers[Math.floor(Math.random() * flowers.length)];
                  b.faceDir = fx > b.x ? 1 : -1;
                  b.goal = clamp(fx - b.faceDir * catLen * 0.42, mf, vw - mf);
                } else {
                  // Roam: sometimes a lazy stroll, sometimes zoomies to the far side.
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
                if (Math.abs(goal - b.x) < 10) b.zoom = false;
              }
              if (b.faceDir !== 0 && b.sniff <= 0 && Math.abs(goal - b.x) < 5 && Math.abs(b.w) < 30) {
                b.sniff = 1.4;
                b.nextWander = t + rand(1.8, 3.5);
              }
              if (hopReady && b.hopQueue > 0 && startHop(rand(30, 44) * sf)) b.hopQueue--;
            }
            break;
          }
        }

        if (b.sniff > 0) {
          b.sniff -= dt;
          if (b.sniff <= 0) b.faceDir = 0;
          goal = b.x;
        }

        // Walking speed relative to the surface.
        let w = 0;
        if (!ride) {
          const desired = clamp((goal - b.x) * 3.2, -vmax, vmax);
          w = clamp(desired - (p.kind === "treadmill" ? p.u : 0), -runMax, runMax);
          if (Math.abs(goal - b.x) < 3 && p.kind !== "treadmill") w = 0;
        }
        b.w += (w - b.w) * Math.min(1, dt * 9);

        if (p.kind === "treadmill") {
          // Endless sliding surface: run against it in screen space.
          b.x += (p.u + b.w) * dt;
          if (b.x < -catLen || b.x > vw + catLen) hide();
        } else if (p.kind === "floor") {
          const before = b.x;
          b.x = clamp(b.x + b.w * dt, mf, vw - mf);
          if (dt > 0) b.w = (b.x - before) / dt;
        } else {
          // Glued to the platform: its motion carries the cat exactly; walking moves it along it.
          const width = p.x1 - p.x0;
          const before = b.local;
          b.local += b.w * dt;
          b.local = width < 2 * m ? width / 2 : clamp(b.local, m, width - m);
          // Stopped by an edge = not walking any more (no running on the spot at the rim).
          if (dt > 0) b.w = (b.local - before) / dt;
          b.x = p.x0 + b.local;
        }
        b.y = surfaceY(p, b.x);
        break;
      }
    }

    // ----- Pose -----
    const grounded = b.state === "ground";
    const plat = grounded ? find(b.plat) : undefined;
    const moving = grounded && Math.abs(b.w) > 12;

    // Pounce: crouch low, wiggle the butt, then leap.
    let crouch = 0;
    if (b.pounceT >= 0) {
      b.pounceT += dt;
      crouch = Math.min(1, b.pounceT / 0.18);
      if (b.pounceT > 0.55 || !grounded) {
        b.pounceT = -1;
        if (startHop(Math.max(80, catH * 1.1))) {
          stage.bursts.push({ x: b.x, y: b.y - catH * 1.05, r: catH * 0.45, hearts: true });
        }
      }
    }
    b.wiggle = damp(b.wiggle, b.pounceT >= 0 && b.pounceT > 0.12 ? 1 : 0, 14, dt);

    let hopY = 0;
    let sy = 1;
    let tuck = 0;
    if (b.hopT >= 0 && grounded) {
      b.hopT += dt;
      const h = b.hopT;
      if (h < HOP_CROUCH) sy = 1 - 0.18 * Math.sin((h / HOP_CROUCH) * (Math.PI / 2));
      else if (h < HOP_CROUCH + b.hopAir) {
        const u = (h - HOP_CROUCH) / b.hopAir;
        hopY = 4 * u * (1 - u) * b.hopH;
        // Stretch out on the way up, round up (tuck) at the top.
        sy = 1 + 0.2 * Math.max(0, 1 - u * 2.2) - 0.06 * Math.max(0, u * 2 - 1.4);
        tuck = Math.sin(u * Math.PI);
      } else if (h < HOP_CROUCH + b.hopAir + HOP_LAND) {
        const u = (h - HOP_CROUCH - b.hopAir) / HOP_LAND;
        sy = 1 - 0.12 * Math.sin(u * Math.PI);
        if (!b.hopLanded) {
          b.hopLanded = true;
          b.jellyV += 5 + b.hopH * 0.03;
          dip(b.plat, b.x, catLen * 0.7, 5 + b.hopH * 0.05);
        }
      } else b.hopT = -1;
    } else if (!grounded) {
      b.hopT = -1;
      const k = b.state === "jump" ? Math.min(b.j.t, 1) : 0.5;
      sy = 1 + 0.16 * Math.sin(k * Math.PI) * (b.state === "jump" ? 1 : 0.5);
      tuck = b.state === "jump" ? Math.sin(k * Math.PI) : 0.7;
    }
    if (b.land > 0) {
      if (b.land === LAND_TIME) b.jellyV += 7 * b.landAmt;
      b.land -= dt;
      const u = 1 - Math.max(b.land, 0) / LAND_TIME;
      sy *= 1 - 0.2 * b.landAmt * Math.sin(u * Math.PI);
    }
    // Chonky jelly: a springy wobble that rings out after every landing.
    b.jellyV += (-b.jelly * 260 - b.jellyV * 8.5) * dt;
    b.jelly += b.jellyV * dt;
    sy *= 1 + b.jelly * 0.07;
    sy *= 1 - crouch * 0.14;

    const relSpeed = moving ? Math.abs(b.w) : 0;
    b.run = damp(b.run, clamp(relSpeed / 240, 0, 1), 8, dt);
    b.phase += relSpeed * dt * 0.055 * (90 / catH) + b.run * dt * 1.5;
    // Bouncy trot: a soft hop on every step, squash in rhythm.
    const gallop = Math.abs(Math.sin(b.phase)) * catH * 0.05 * Math.max(b.run, b.turnStep * 0.5);
    sy *= 1 + Math.sin(b.phase * 2) * 0.03 * b.run;
    // Breathing (slower and deeper when sitting).
    b.breath += dt * (b.sit > 0.5 ? 1.5 : 2.2) * (1 + b.run * 0.8);
    const breath = Math.sin(b.breath);
    // Purr: the tiniest shiver while being petted.
    if (b.pet && !moving) sy *= 1 + Math.sin(t * 60) * 0.004;
    const sxz = 1 / Math.sqrt(sy);

    // Idle life: sit down after a moment of calm.
    const calm = grounded && !moving && b.hopT < 0 && b.pounceT < 0 && plat?.kind !== "treadmill";
    b.idleFor = calm ? b.idleFor + dt : 0;
    const wantSit = b.idleFor > 2.4 && !b.pet && plat?.kind !== "perch" ? 1 : 0;
    b.sit = damp(b.sit, wantSit, wantSit ? 2.6 : 12, dt);

    // Facing: the body turns only a little toward the pointer; the head does the looking.
    const dx = view.pointerX - b.x;
    const dy = view.pointerY - (b.y - catH * 0.8);
    // The cat can walk away from a resting pointer: stop petting once it is out of reach.
    if (b.pet && Math.hypot(dx, dy) > catH * 1.6) b.pet = false;
    let face = b.yaw;
    if (grounded && b.sniff > 0 && b.faceDir !== 0) face = b.faceDir * SIDE;
    else if (moving && Math.abs(b.w) > 25) face = Math.sign(b.w) * SIDE;
    else if (!grounded && Math.abs(b.vx) > 60) face = Math.sign(b.vx) * SIDE;
    else if (grounded) face = clamp((dx / vw) * 1.3, -0.5, 0.5);
    const prevYaw = b.yaw;
    b.yaw = dampAngle(b.yaw, face, moving ? 6 : 3.5, dt);
    const turnRate = Math.abs(Math.atan2(Math.sin(b.yaw - prevYaw), Math.cos(b.yaw - prevYaw))) / Math.max(dt, 1e-3);
    // Paws patter through the turn (on the ground, walking or not) instead of the cat spinning on the spot.
    b.turnStep = damp(b.turnStep, grounded ? clamp(turnRate / 1.2, 0, 1) : 0, 12, dt);
    b.phase += turnRate * dt * 4.5;

    // Head: look at the pointer, curious tilts, rubbing when petted, bob while trotting.
    let hYaw = 0;
    let hPitch = 0;
    let hRoll = 0;
    if (grounded && !moving) {
      hYaw = clamp(Math.atan2(dx, catH * 2.2) - b.yaw, -0.45, 0.45);
      hPitch = clamp(dy / (vh * 0.45), -1, 1) * 0.16;
      if (t > b.nextTilt) {
        b.tiltTarget = (Math.random() < 0.5 ? -1 : 1) * rand(0.1, 0.18);
        b.tiltUntil = t + rand(0.9, 1.6);
        b.nextTilt = t + rand(3.5, 7);
      }
      if (t < b.tiltUntil) hRoll = b.tiltTarget;
      if (b.pet) {
        // Leaning into the pets: slow, soft head rubs.
        hRoll = Math.sin(t * 2.4) * 0.14;
        hPitch -= 0.06;
      }
    } else if (moving) {
      hPitch = Math.sin(b.phase * 2) * 0.04 * b.run;
      hYaw = -Math.sign(b.w) * 0.1 * (1 - b.run);
    } else {
      hPitch = clamp(b.vy * 0.0002, -0.15, 0.15);
    }
    if (b.sniff > 0) hPitch = 0.28;
    if (crouch > 0) hPitch = -0.1;
    b.head.yaw = damp(b.head.yaw, hYaw, 5, dt);
    b.head.pitch = damp(b.head.pitch, hPitch, 5, dt);
    b.head.roll = damp(b.head.roll, hRoll, 4, dt);

    // Ears: random flicks, laid back a bit while petted.
    if (t > b.nextEar) {
      if (Math.random() < 0.5) b.ears.l = 1;
      else b.ears.r = 1;
      if (Math.random() < 0.25) b.ears.l = b.ears.r = 1;
      b.nextEar = t + rand(1.5, 4.5);
    }
    const earRest = b.pet ? 0.45 : 0;
    b.ears.l = Math.max(earRest, b.ears.l * Math.exp(-dt * 9));
    b.ears.r = Math.max(earRest, b.ears.r * Math.exp(-dt * 9));

    // Tail: up and happy when walking or petted, lashing before a pounce, trailing in the air,
    // lazy swishes when idle.
    let tUp = 0.3;
    let tAmp = 0.13;
    let tSpeed = 0.8;
    if (b.pet && !moving) {
      tUp = 1.2;
      tAmp = 0.07;
      tSpeed = 1.1;
    } else if (crouch > 0) {
      tUp = 0.15;
      tAmp = 0.2;
      tSpeed = 3.2;
    } else if (!grounded || b.hopT >= 0) {
      tUp = 0.7;
      tAmp = 0.08;
      tSpeed = 1.4;
    } else if (moving) {
      tUp = 0.9 - b.run * 0.5;
      tAmp = 0.05 + b.run * 0.03;
      tSpeed = 1.6 + b.run * 1.0;
    } else if (b.sit > 0.5) {
      tUp = -0.05;
      tAmp = 0.08;
      tSpeed = 0.6;
    }
    b.tail.up = damp(b.tail.up, tUp, 5, dt);
    b.tail.amp = damp(b.tail.amp, tAmp, 5, dt);
    b.tail.speed = damp(b.tail.speed, tSpeed, 1.5, dt);
    b.tail.phase += b.tail.speed * dt;

    // Hearts while being petted.
    if (b.pet && grounded && t > b.nextHeart) {
      stage.bursts.push({ x: b.x + Math.sin(b.yaw) * catLen * 0.25, y: b.y - catH * 1.05, r: catH * 0.22, hearts: true });
      b.nextHeart = t + rand(0.8, 1.3);
    }

    let pitch = 0;
    if (grounded) pitch = Math.cos(b.phase) * 0.06 * b.run - tuck * 0.12 - b.sit * 0.1 + crouch * 0.16;
    else pitch = clamp(b.vy * 0.00045, -0.45, 0.45);
    b.pitch = damp(b.pitch, pitch, 10, dt);
    // Chonky waddle side to side while trotting.
    const waddle = Math.sin(b.phase) * 0.06 * b.run;

    b.tilt = damp(b.tilt, plat ? -plat.angle : 0, 8, dt);
    if (b.state !== "fall") {
      // Settle any tumble back upright.
      const rest = Math.round(b.tumble / (Math.PI * 2)) * Math.PI * 2;
      b.tumble = damp(b.tumble, rest, 12, dt);
    }

    // ----- Render -----
    const feetX = b.x;
    const feetY = b.y - hopY - gallop;
    const r = root.current;
    const yg = yawG.current;
    const bd = body.current;
    if (r && yg && bd) {
      r.visible = b.state !== "hidden";
      toWorld(feetX, feetY, r.position);
      const s = unitsPerPx(feetX, feetY);
      const scale = (catH * s) / modelH;
      r.rotation.z = b.tilt;
      yg.rotation.y = b.yaw;
      bd.position.y = (modelH / 2) * scale * sy;
      bd.rotation.set(b.pitch, 0, b.tumble + waddle);
      bd.scale.set(scale * sxz, scale * sy, scale * sxz);

      const sh = shadow.current;
      if (sh) {
        const surface = grounded ? b.y : NaN;
        sh.visible = r.visible && grounded;
        if (sh.visible) {
          toWorld(b.x, surface, sh.position);
          sh.position.z -= 0.25;
          const lift = clamp((hopY + gallop) / (catH * 1.5), 0, 1);
          sh.scale.set(catLen * s * 0.95 * (1 - lift * 0.4), catH * s * 0.22 * (1 - lift * 0.4), 1);
          sh.rotation.z = b.tilt;
          (sh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - lift * 0.7);
        }
      }
    }

    uniforms.uPhase.value = b.phase;
    uniforms.uRun.value = Math.max(b.run, b.turnStep * 0.75);
    uniforms.uTuck.value = tuck;
    uniforms.uTime.value = t;
    uniforms.uHead.value.set(b.head.yaw, b.head.pitch, b.head.roll);
    uniforms.uEars.value.set(b.ears.l, b.ears.r);
    uniforms.uTail.value.set(b.tail.up, b.tail.amp, b.tail.phase);
    uniforms.uSit.value = b.sit;
    uniforms.uWiggle.value = b.wiggle;
    uniforms.uBreath.value = breath;

    // Publish for bubbles, charms and the garden.
    const c = stage.cat;
    c.visible = b.state !== "hidden";
    c.x = b.x;
    c.y = feetY;
    c.vx = grounded ? b.w + (plat?.u ?? 0) : b.vx;
    c.h = catH;
    c.airborne = !grounded || hopY > 6;
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
          </group>
        </group>
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
