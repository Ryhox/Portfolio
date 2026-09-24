"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { scroll } from "@/lib/scroll";
import { createBubbleMaterial } from "./materials";
import { introBurst, introPop, world } from "./world";

// Each bubble has its own spot on the page, like the charms.
// sec: [data-section] name, v: offset from the section top in viewport heights, x: in half-widths.
const BUBBLES: { sec: string; v: number; x: number; z: number; r: number }[] = [
  { sec: "hero", v: 0.12, x: -0.93, z: -0.5, r: 0.22 },
  { sec: "hero", v: 0.2, x: 0.78, z: -1.2, r: 0.42 },
  { sec: "hero", v: 0.62, x: -0.62, z: 0.4, r: 0.26 },
  { sec: "hero", v: 0.66, x: 0.28, z: 0.8, r: 0.3 },
  { sec: "hero", v: 0.86, x: 0.88, z: -0.4, r: 0.2 },
  { sec: "intro", v: 0.3, x: 0.52, z: 0.3, r: 0.5 },
  { sec: "intro", v: 0.55, x: 0.84, z: -1.5, r: 0.24 },
  { sec: "intro", v: 0.72, x: 0.62, z: 0.6, r: 0.16 },
  { sec: "intro", v: 1.05, x: -0.7, z: -0.8, r: 0.3 },
  { sec: "marquee", v: 0.05, x: 0.35, z: 0.9, r: 0.22 },
  { sec: "marquee", v: 0.62, x: -0.3, z: -1, r: 0.34 },
  { sec: "marquee", v: 0.85, x: 0.8, z: 0.2, r: 0.18 },
  { sec: "contact", v: 0.18, x: -0.82, z: -0.6, r: 0.36 },
  { sec: "contact", v: 0.4, x: 0.86, z: 0.3, r: 0.22 },
  { sec: "contact", v: 0.62, x: -0.5, z: 0.5, r: 0.16 },
];

const RESPAWN = 2.2;

export default function Bubbles() {
  const material = useMemo(() => createBubbleMaterial(), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 64, 48), []);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const state = useRef(BUBBLES.map(() => ({ dead: 0, grow: 1, jiggle: 0, jiggleV: 0 })));
  const positions = useRef(BUBBLES.map(() => new THREE.Vector3()));

  const onOver = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
    state.current[i].jiggleV += 6;
  };
  const onOut = () => {
    document.body.style.cursor = "";
  };
  const onClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const b = state.current[i];
    if (b.dead > 0) return;
    world.pops.push({ pos: positions.current[i].clone(), radius: BUBBLES[i].r * world.k });
    b.dead = RESPAWN;
    b.grow = 0;
    document.body.style.cursor = "";
  };

  useFrame((frame, dt) => {
    const d = Math.min(dt, 1 / 30);
    const t = frame.clock.elapsedTime;
    const vh = scroll.vh;

    BUBBLES.forEach((c, i) => {
      const m = meshes.current[i];
      if (!m) return;
      const b = state.current[i];

      const top = scroll.anchors[c.sec] ?? 0;
      const ds = (world.camDist - c.z) / world.camDist;
      const offset = top + c.v * vh - (scroll.y + vh / 2);
      const x = c.x * world.W * ds + Math.sin(t * 0.4 + i * 2.1) * 0.08;
      const y = -offset * world.pxToWorld * ds + Math.sin(t * 0.8 + i * 1.3) * 0.1;
      positions.current[i].set(x, y, c.z);

      if (b.dead > 0) {
        b.dead -= d;
        m.visible = false;
        return;
      }
      m.visible = Math.abs(y) < world.H * ds + 1.5;

      // The cat pops bubbles it jumps into and nudges the ones it walks past.
      const cat = world.cat;
      if (cat.radius > 0 && b.grow >= 1) {
        const dist = Math.hypot(x - cat.pos.x, y - cat.pos.y, c.z - cat.pos.z);
        if (dist < c.r * world.k + cat.radius) {
          if (cat.airborne) {
            world.pops.push({ pos: positions.current[i].clone(), radius: c.r * world.k });
            b.dead = RESPAWN;
            b.grow = 0;
            m.visible = false;
            return;
          }
          b.jiggleV += 3;
        }
      }

      // Re-inflate after a pop, springy jiggle on hover.
      b.grow = Math.min(1, b.grow + d * 1.6);
      b.jiggleV += (-b.jiggle * 140 - b.jiggleV * 7) * d;
      b.jiggle += b.jiggleV * d * 0.02;
      const inflate = 1 - Math.pow(1 - b.grow, 3) + Math.sin(b.grow * Math.PI) * 0.12;

      const wob = Math.sin(t * 2.2 + i) * 0.02 + b.jiggle;
      const s = c.r * world.k * inflate * Math.max(introPop(0.4 + i * 0.05), 1e-4);
      const burst = introBurst(i * 0.015);
      m.position.set(x * burst, y * burst, c.z);
      m.scale.set(s * (1 + wob), s * (1 - wob), s * (1 + wob * 0.5));
    });
  });

  return (
    <group>
      {BUBBLES.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geometry}
          material={material}
          onPointerOver={onOver(i)}
          onPointerOut={onOut}
          onClick={onClick(i)}
        />
      ))}
      <PopEffects />
    </group>
  );
}

const BURSTS = 6;
const DROPS = 10;

type Burst = { age: number; pos: THREE.Vector3; r: number; dirs: THREE.Vector3[] };

function PopEffects() {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const drops = useRef<(THREE.InstancedMesh | null)[]>([]);
  const bursts = useRef<Burst[]>(
    Array.from({ length: BURSTS }, () => ({
      age: 99,
      pos: new THREE.Vector3(),
      r: 0.3,
      dirs: Array.from({ length: DROPS }, () => new THREE.Vector3()),
    })),
  );
  const next = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const materials = useMemo(
    () =>
      Array.from({ length: BURSTS }, () => ({
        ring: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false }),
        drop: new THREE.MeshBasicMaterial({ color: "#fbeaff", transparent: true, depthWrite: false }),
      })),
    [],
  );

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30);
    while (world.pops.length) {
      const p = world.pops.shift()!;
      const b = bursts.current[next.current];
      next.current = (next.current + 1) % BURSTS;
      b.age = 0;
      b.pos.copy(p.pos);
      b.r = p.radius;
      b.dirs.forEach((v, i) => {
        const a = (i / DROPS) * Math.PI * 2 + Math.random() * 0.4;
        v.set(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.6).multiplyScalar(0.8 + Math.random() * 0.6);
      });
    }

    bursts.current.forEach((b, i) => {
      const g = groups.current[i];
      const ring = rings.current[i];
      const inst = drops.current[i];
      if (!g || !ring || !inst) return;
      b.age += d;
      const u = b.age / 0.55;
      g.visible = u < 1;
      if (u >= 1) return;
      g.position.copy(b.pos);
      const ease = 1 - Math.pow(1 - u, 3);
      ring.scale.setScalar(b.r * (1 + ease * 0.9));
      materials[i].ring.opacity = (1 - u) * 0.8;
      materials[i].drop.opacity = (1 - u) * 0.95;
      b.dirs.forEach((v, j) => {
        const dist = b.r * (1 + ease * 1.6);
        dummy.position.set(v.x * dist, v.y * dist - u * u * 0.35, v.z * dist);
        dummy.scale.setScalar(b.r * 0.07 * (1 - u * 0.6));
        dummy.updateMatrix();
        inst.setMatrixAt(j, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <>
      {Array.from({ length: BURSTS }, (_, i) => (
        <group
          key={i}
          visible={false}
          ref={(g) => {
            groups.current[i] = g;
          }}
        >
          <mesh
            ref={(m) => {
              rings.current[i] = m;
            }}
            material={materials[i].ring}
          >
            <torusGeometry args={[1, 0.018, 8, 64]} />
          </mesh>
          <instancedMesh
            ref={(m) => {
              drops.current[i] = m;
            }}
            args={[undefined, materials[i].drop, DROPS]}
            frustumCulled={false}
          >
            <sphereGeometry args={[1, 12, 8]} />
          </instancedMesh>
        </group>
      ))}
    </>
  );
}
