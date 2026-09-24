"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { publishStats, stage } from "@/lib/stage";
import { FLOWER_TYPES, PETALS, flowerGeometries, flowerMaterials, type FlowerType } from "./flowers";
import { catHeight, toWorld, unitsPerPx, view } from "./view";

// Flowers that grow where sinking bubbles land (for this visit only).

const MAX_FLOWERS = 24;

type FlowerData = {
  id: number;
  f: number; // x as a fraction of the viewport width
  type: FlowerType;
  petal: number;
  size: number; // stem height in px
  z: number;
  seed: number;
  born: number; // clock time it was planted
  wilt: number; // clock time it started wilting, or -1
};

const clamp = THREE.MathUtils.clamp;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
function easeOutBack(x: number) {
  const c1 = 1.9;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeOutElastic(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export default function Garden() {
  const [flowers, setFlowers] = useState<FlowerData[]>([]);
  const nextId = useRef(1000);

  useEffect(() => {
    // Earlier builds saved the garden; it's session-only now, so drop any leftovers.
    try {
      localStorage.removeItem("ryhox-garden-v1");
    } catch {
      // Storage unavailable: nothing to clean up.
    }
  }, []);

  useEffect(() => {
    const alive = flowers.filter((f) => f.wilt < 0);
    stage.flowerXs = alive.map((f) => f.f * view.vw);
    stage.stats.flowers = alive.length;
    publishStats();
  }, [flowers]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    stage.flowerXs = flowers.filter((f) => f.wilt < 0).map((f) => f.f * view.vw);

    if (stage.plants.length) {
      const xs = stage.plants.splice(0);
      setFlowers((prev) => {
        let next = prev;
        for (const x of xs) {
          const f = x / view.vw;
          if (f < 0.02 || f > 0.98) continue;
          const alive = next.filter((fl) => fl.wilt < 0);
          if (alive.some((fl) => Math.abs(fl.f * view.vw - x) < 30)) continue;
          if (alive.length >= MAX_FLOWERS) {
            const oldest = alive[0];
            next = next.map((fl) => (fl.id === oldest.id ? { ...fl, wilt: t } : fl));
          }
          next = [
            ...next,
            {
              id: nextId.current++,
              f,
              type: FLOWER_TYPES[Math.floor(Math.random() * FLOWER_TYPES.length)],
              petal: Math.floor(Math.random() * PETALS.length),
              size: rand(110, 175),
              z: rand(-0.35, 0.3),
              seed: Math.random() * 100,
              born: t,
              wilt: -1,
            },
          ];
        }
        return next;
      });
    }

    if (flowers.some((f) => f.wilt >= 0 && t - f.wilt > 0.7)) {
      setFlowers((prev) => prev.filter((f) => f.wilt < 0 || t - f.wilt <= 0.7));
    }
  });

  return (
    <group>
      {flowers.map((f) => (
        <Flower key={f.id} data={f} />
      ))}
    </group>
  );
}

function Flower({ data }: { data: FlowerData }) {
  const geos = flowerGeometries();
  const mats = flowerMaterials();
  const parts = geos.blooms[data.type];
  const root = useRef<THREE.Group>(null);
  const stem = useRef<THREE.Mesh>(null);
  const leafA = useRef<THREE.Group>(null);
  const leafB = useRef<THREE.Group>(null);
  const bloom = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Mesh>(null);
  const anim = useRef({ bend: 0, bendV: 0, sparkled: false });
  const tilt = useMemo(() => (data.seed % 1) * 0.3 - 0.15, [data.seed]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const t = state.clock.elapsedTime;
    const r = root.current;
    if (!r || !stem.current || !leafA.current || !leafB.current || !bloom.current) return;

    const tb = t - data.born;
    const x = data.f * view.vw;
    const y = stage.floorY + 3;
    r.visible = tb > 0 && y < view.vh + 400;
    if (!r.visible) return;

    const wilt = data.wilt >= 0 ? 1 - clamp((t - data.wilt) / 0.6, 0, 1) : 1;
    const s = data.size * (view.vw < 700 ? 0.72 : Math.min(1, view.vw / 1440) * 0.35 + 0.65) * unitsPerPx(x, y);
    toWorld(x, y, r.position);
    r.position.z = data.z;
    r.scale.setScalar(Math.max(s * wilt, 1e-5));

    const g1 = easeOutBack(clamp(tb / 0.7, 0, 1));
    stem.current.scale.set(Math.max(0.6 + 0.4 * g1, 1e-4), Math.max(g1, 1e-4), Math.max(0.6 + 0.4 * g1, 1e-4));
    const g2 = easeOutBack(clamp((tb - 0.3) / 0.5, 0, 1));
    leafA.current.scale.setScalar(Math.max(g2 * 0.55, 1e-4));
    leafB.current.scale.setScalar(Math.max(g2 * 0.45, 1e-4));
    const g3 = easeOutElastic(clamp((tb - 0.55) / 0.9, 0, 1));
    bloom.current.scale.setScalar(Math.max(g3, 1e-4));
    bloom.current.position.y = g1;
    bloom.current.rotation.z = (1 - clamp((tb - 0.55) / 0.9, 0, 1)) * 2.4 + tilt;

    const a = anim.current;
    if (!a.sparkled && tb > 0.75) {
      a.sparkled = true;
      stage.bursts.push({ x, y: y - data.size * 0.9, r: data.size * 0.28, sparkle: true });
    }

    // Brushed by the cat or the wand.
    const cat = stage.cat;
    const reach = catHeight(view.vw) * 0.9;
    if (cat.visible && Math.abs(cat.x - x) < reach && Math.abs(cat.y - y) < reach) {
      a.bendV += cat.vx * 0.0009 * dt * 60 * (1 - Math.abs(cat.x - x) / reach);
    }
    const wand = stage.wand;
    if (wand.active && Math.abs(wand.x - x) < 70 && wand.y > y - data.size * 1.5 && wand.y < y + 20) {
      a.bendV += wand.vx * 0.0006 * dt * 60;
    }
    a.bendV += (-a.bend * 26 - a.bendV * 3.2) * dt;
    a.bend = clamp(a.bend + a.bendV * dt, -0.7, 0.7);
    r.rotation.z = Math.sin(t * 1.2 + data.seed) * 0.05 - a.bend;

    if (wings.current) wings.current.rotation.y = Math.sin(t * 13 + data.seed) * 0.8;
  });

  const petalMat = mats.petals[data.petal % mats.petals.length];
  return (
    <group ref={root} visible={false}>
      <mesh ref={stem} geometry={geos.stem} material={mats.stem} />
      <group ref={leafA} position={[0.01, 0.28, 0]} rotation={[0, 0, -0.95]}>
        <mesh geometry={geos.leaf} material={mats.stem} />
      </group>
      <group ref={leafB} position={[-0.01, 0.5, 0]} rotation={[0, 0, 0.9]}>
        <mesh geometry={geos.leaf} material={mats.stem} />
      </group>
      <group ref={bloom} position={[0, 1, 0]}>
        {parts.map((p, i) => (
          <mesh
            key={i}
            ref={p.role === "wing" ? wings : undefined}
            geometry={p.geo}
            material={p.role === "center" ? mats.center : petalMat}
            position={p.position}
            rotation={p.rotation}
            scale={p.scale}
          />
        ))}
      </group>
    </group>
  );
}
