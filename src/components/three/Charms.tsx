"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { scroll } from "@/lib/scroll";
import { createCharmMaterial } from "./materials";
import { butterflyShape, heartShape, moonShape, puffy, sparkleShape, starShape } from "./shapes";
import { introBurst, introPop, world } from "./world";

type Kind = "heart" | "sparkle" | "star" | "moon" | "butterfly" | "orbit";

// sec: [data-section] name, v: offset from the section top in viewport heights, x: in half-widths.
// Charms in the pinned "work" gallery sit in the gap after child `gap` of the track and ride along horizontally.
type Charm = { kind: Kind; sec: string; v: number; x: number; z: number; s: number; tilt: number; gap?: number };
const CHARMS: Charm[] = [
  { kind: "moon", sec: "hero", v: 0.26, x: -0.8, z: -1.5, s: 0.42, tilt: 0.4 },
  { kind: "butterfly", sec: "hero", v: 0.62, x: 0.84, z: -0.6, s: 0.36, tilt: -0.3 },
  { kind: "butterfly", sec: "intro", v: 0.22, x: 0.74, z: -1.2, s: 0.4, tilt: 0.25 },
  { kind: "sparkle", sec: "intro", v: 0.36, x: 0.9, z: 0.2, s: 0.18, tilt: 0 },
  { kind: "star", sec: "intro", v: 0.9, x: -0.84, z: -2.2, s: 0.34, tilt: -0.2 },
  { kind: "sparkle", sec: "work", gap: 0, v: 0.22, x: 0, z: 0.4, s: 0.2, tilt: 0 },
  { kind: "orbit", sec: "work", gap: 1, v: 0.42, x: 0, z: 1.2, s: 0.34, tilt: 0.2 },
  { kind: "moon", sec: "work", gap: 2, v: 0.62, x: 0, z: 1.0, s: 0.36, tilt: -0.4 },
  { kind: "butterfly", sec: "work", gap: 3, v: 0.36, x: 0, z: 1.2, s: 0.32, tilt: 0.3 },
  { kind: "star", sec: "work", gap: 4, v: 0.55, x: 0, z: 0.8, s: 0.3, tilt: -0.2 },
  { kind: "heart", sec: "contact", v: 0.24, x: 0.74, z: -0.6, s: 0.4, tilt: -0.25 },
  { kind: "star", sec: "contact", v: 0.36, x: -0.76, z: -0.9, s: 0.36, tilt: 0.3 },
  { kind: "sparkle", sec: "contact", v: 0.14, x: -0.42, z: -0.2, s: 0.14, tilt: 0 },
  { kind: "sparkle", sec: "contact", v: 0.62, x: 0.52, z: 0.1, s: 0.12, tilt: 0 },
];

// Screen-center-relative px position of a point on the pinned horizontal gallery.
// Mirrors Motion.tsx: the pin lasts (contact top - work top - vh) px and moves the track 1/1.1 of that.
function galleryPosition(gapIndex: number, v: number) {
  if (window.innerWidth < 900) return null;
  const vh = scroll.vh;
  const vw = window.innerWidth;
  const top = scroll.anchors.work;
  const pin = (scroll.anchors.contact ?? 0) - top - vh;
  if (top === undefined || pin <= 0) return null;
  const local = scroll.y - top;
  const shift = Math.min(Math.max(local, 0), pin) / 1.1;
  const gx = scroll.galleryGaps[gapIndex];
  if (gx === undefined) return null;
  const x = gx - shift - vw / 2;
  const y = v * vh - vh / 2 - Math.min(local, 0) - Math.max(local - pin, 0);
  return { x, y };
}

export default function Charms() {
  const material = useMemo(() => createCharmMaterial(), []);
  const geos = useMemo(
    () => ({
      heart: puffy(heartShape(), 0.25, 0.26),
      sparkle: puffy(sparkleShape(), 0.1, 0.12, 0.08),
      star: puffy(starShape(), 0.18, 0.2, 0.14),
      moon: puffy(moonShape(), 0.2, 0.2, 0.12),
      butterfly: puffy(butterflyShape(), 0.14, 0.16, 0.1),
    }),
    [],
  );
  const ringGeo = useMemo(() => new THREE.TorusGeometry(1.55, 0.045, 20, 160), []);

  const refs = useRef<(THREE.Group | null)[]>([]);
  const spins = useRef(CHARMS.map(() => ({ angle: 0, vel: 0, squish: 0, squishV: 0 })));

  const kick = (i: number, strength: number) => {
    spins.current[i].vel += strength;
    spins.current[i].squishV += strength * 0.6;
  };

  const onOver = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
    kick(i, 3);
  };
  const onOut = () => {
    document.body.style.cursor = "";
  };
  const onClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    kick(i, 16);
  };

  useFrame((state, dt) => {
    const d = Math.min(dt, 1 / 30);
    const t = state.clock.elapsedTime;
    const vh = scroll.vh;

    CHARMS.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const ds = (world.camDist - c.z) / world.camDist;
      let x: number;
      let y: number;
      if (c.gap !== undefined) {
        const p = galleryPosition(c.gap, c.v);
        if (!p) {
          g.visible = false;
          return;
        }
        x = p.x * world.pxToWorld * ds;
        y = -p.y * world.pxToWorld * ds;
      } else {
        const top = scroll.anchors[c.sec] ?? 0;
        // Screen-center offset in px, mapped into world units at this depth.
        const offset = top + c.v * vh - (scroll.y + vh / 2);
        y = -offset * world.pxToWorld * ds;
        x = c.x * world.W * ds;
      }
      g.visible = Math.abs(y) < world.H * ds + 2 && Math.abs(x) < world.W * ds + 2;
      if (!g.visible) return;

      const sp = spins.current[i];
      sp.vel *= Math.exp(-2.2 * d);
      sp.angle += sp.vel * d;
      sp.squishV += (-sp.squish * 120 - sp.squishV * 10) * d;
      sp.squish += sp.squishV * d * 0.02;

      // Spin if the cat bumps into it.
      const cat = world.cat;
      const dist = Math.hypot(x - cat.pos.x, y - cat.pos.y, c.z - cat.pos.z);
      if (dist < cat.radius + c.s * 1.2 && Math.abs(sp.vel) < 2) kick(i, 8);

      const s = c.s * world.k * Math.max(introPop(0.55 + i * 0.07), 1e-4);
      const burst = introBurst(0.02 + i * 0.02);
      g.position.set(x * burst, (y + Math.sin(t * 0.7 + i * 1.9) * 0.1) * burst, c.z);
      g.rotation.set(
        Math.sin(t * 0.5 + i) * 0.18,
        Math.sin(t * 0.35 + i * 2.3) * 0.55 + sp.angle,
        c.tilt + Math.sin(t * 0.45 + i * 0.7) * 0.1,
      );
      g.scale.set(s * (1 + sp.squish), s * (1 - sp.squish), s);
    });
  });

  return (
    <group>
      {CHARMS.map((c, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
          onPointerOver={onOver(i)}
          onPointerOut={onOut}
          onClick={onClick(i)}
        >
          {c.kind === "orbit" ? (
            <>
              <mesh geometry={geos.heart} material={material} />
              <mesh geometry={ringGeo} material={material} rotation={[1.2, 0.3, 0]} />
            </>
          ) : (
            <mesh geometry={geos[c.kind]} material={material} />
          )}
        </group>
      ))}
    </group>
  );
}
