"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { publishStats, stage } from "@/lib/stage";
import { scroll } from "@/lib/scroll";
import { createFilmMaterial } from "../three/materials";
import { toWorld, unitsPerPx, view } from "./view";

// Soap bubbles blown from the wand. Physics runs in screen px, shifted with the scroll so they stay put on
// the page while you look around the garden; they all pop once you scroll back up and out of it.
// Rendered as one instanced mesh.

const MAX = 90;

type Bubble = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  buoy: number;
  sink: boolean;
  age: number;
  life: number;
  seed: number;
  alive: boolean;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export default function WandBubbles() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => createFilmMaterial(), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 40, 28), []);
  const bubbles = useRef<Bubble[]>([]);
  const nextId = useRef(1);
  const lastCatch = useRef(0);
  const lastY = useRef(scroll.y);
  const wasGarden = useRef(false);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const list = bubbles.current;
    const small = view.vw < 700 ? 0.75 : 1;
    // The page moved: so do the bubbles on it.
    const dy = scroll.y - lastY.current;
    lastY.current = scroll.y;
    // Leaving the garden: every bubble still around pops, in a quick ripple.
    if (wasGarden.current && !stage.garden) for (const b of list) b.life = Math.min(b.life, b.age + Math.random() * 0.35);
    wasGarden.current = stage.garden;

    while (stage.emits.length) {
      const e = stage.emits.shift()!;
      if (list.length >= MAX) continue;
      const sink = Math.random() < 0.5;
      list.push({
        id: nextId.current++,
        x: e.x,
        y: e.y,
        vx: e.vx,
        vy: e.vy,
        r: rand(9, 27) * small,
        // Heavier bubbles drift down and seed a flower where they land.
        sink,
        buoy: sink ? -rand(14, 28) : rand(16, 44),
        age: 0,
        life: sink ? 18 : rand(7, 12),
        seed: Math.random() * 100,
        alive: true,
      });
    }

    const cat = stage.cat;
    const pop = (b: Bubble, burst: boolean, byCat = false) => {
      b.alive = false;
      if (burst) stage.bursts.push({ x: b.x, y: b.y, r: b.r, hearts: byCat });
    };

    for (const b of list) {
      if (!b.alive) continue;
      b.age += dt;
      b.vx += Math.sin(b.age * 2.1 + b.seed) * 26 * dt;
      b.vy -= b.buoy * dt;
      b.vx *= Math.exp(-0.9 * dt);
      b.vy *= Math.exp(-0.7 * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt - dy;

      if (stage.garden && b.y + b.r > stage.floorY) {
        if (b.sink) {
          pop(b, true);
          stage.plants.push(b.x);
          continue;
        }
        b.y = stage.floorY - b.r;
        b.vy = -Math.abs(b.vy) * 0.4;
      }

      // The cat catches bubbles mid-leap, with a short breather between catches.
      if (cat.visible && cat.airborne && b.age > 0.25 && state.clock.elapsedTime - lastCatch.current > 0.4) {
        const dx = b.x - cat.head.x;
        const dy = b.y - cat.head.y;
        const rr = b.r + cat.head.r;
        if (dx * dx + dy * dy < rr * rr) {
          pop(b, true, true);
          lastCatch.current = state.clock.elapsedTime;
          stage.stats.pops++;
          stage.catches++;
          publishStats();
          continue;
        }
      }

      // Only floating away over the top (or out sideways) loses a bubble; below the screen it just waits
      // for you to scroll back down to it.
      const off = b.y < -b.r * 2 - 40 || b.x < -150 || b.x > view.vw + 150 || (!stage.garden && b.y > view.vh + 200);
      if (off) b.alive = false;
      else if (b.age > b.life) pop(b, true);
    }

    // Drop the dead ones in place.
    let n = 0;
    for (const b of list) if (b.alive) list[n++] = b;
    list.length = n;
    stage.bubbles = list;

    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    list.forEach((b, i) => {
      const inflate = Math.min(1, b.age / 0.22);
      const s = b.r * unitsPerPx(b.x, b.y) * (0.35 + 0.65 * inflate);
      const wob = Math.sin(t * 3.2 + b.seed) * 0.035;
      toWorld(b.x, b.y, dummy.position);
      dummy.rotation.set(0, b.seed, 0);
      dummy.scale.set(s * (1 + wob), s * (1 - wob), s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, MAX]} frustumCulled={false} renderOrder={5} />;
}
