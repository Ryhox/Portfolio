"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { stage } from "@/lib/stage";
import { heartShape, puffy, sparkleShape } from "../three/shapes";
import { createHolo } from "../three/materials";
import { toWorld, unitsPerPx } from "./view";

// Pop rings + droplets, floating hearts when the cat catches something, sparkles when a flower blooms.

const POOL = 14;
const DROPS = 9;
const EXTRAS = 4;

type Burst = {
  age: number;
  x: number;
  y: number;
  r: number;
  hearts: boolean;
  sparkle: boolean;
  dirs: THREE.Vector2[];
};

export default function Bursts() {
  const heartGeo = useMemo(() => puffy(heartShape(), 0.25, 0.26), []);
  const sparkleGeo = useMemo(() => puffy(sparkleShape(), 0.1, 0.12, 0.08), []);
  const pinkMat = useMemo(() => createHolo({ color: "#ffb3e2", rim: 0.9, envMapIntensity: 1.5 }), []);
  const sparkleMat = useMemo(() => createHolo({ color: "#f4ecff", rim: 1, envMapIntensity: 1.6 }), []);
  const mats = useMemo(
    () =>
      Array.from({ length: POOL }, () => ({
        ring: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false }),
        drop: new THREE.MeshBasicMaterial({ color: "#fbe8ff", transparent: true, depthWrite: false }),
      })),
    [],
  );
  const pool = useRef<Burst[]>(
    Array.from({ length: POOL }, () => ({
      age: 99,
      x: 0,
      y: 0,
      r: 10,
      hearts: false,
      sparkle: false,
      dirs: Array.from({ length: DROPS }, () => new THREE.Vector2()),
    })),
  );
  const next = useRef(0);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const drops = useRef<(THREE.InstancedMesh | null)[]>([]);
  const extras = useRef<(THREE.Mesh | null)[][]>(Array.from({ length: POOL }, () => []));
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    while (stage.bursts.length) {
      const req = stage.bursts.shift()!;
      const b = pool.current[next.current];
      next.current = (next.current + 1) % POOL;
      b.age = 0;
      b.x = req.x;
      b.y = req.y;
      b.r = req.r;
      b.hearts = !!req.hearts;
      b.sparkle = !!req.sparkle;
      b.dirs.forEach((d, i) => {
        const a = (i / DROPS) * Math.PI * 2 + Math.random() * 0.5;
        d.set(Math.cos(a), Math.sin(a)).multiplyScalar(0.8 + Math.random() * 0.6);
      });
    }

    pool.current.forEach((b, i) => {
      const g = groups.current[i];
      const ring = rings.current[i];
      const inst = drops.current[i];
      if (!g || !ring || !inst) return;
      b.age += dt;
      const life = b.hearts || b.sparkle ? 1.3 : 0.55;
      const u = b.age / life;
      g.visible = u < 1;
      if (u >= 1) return;

      toWorld(b.x, b.y, g.position);
      const s = unitsPerPx(b.x, b.y);
      const pu = Math.min(1, b.age / 0.55);
      const ease = 1 - Math.pow(1 - pu, 3);

      ring.visible = !b.sparkle && !b.hearts && pu < 1;
      ring.scale.setScalar(b.r * s * (1 + ease * 0.9));
      mats[i].ring.opacity = (1 - pu) * 0.85;
      inst.visible = !b.sparkle && !b.hearts && pu < 1;
      mats[i].drop.opacity = (1 - pu) * 0.95;
      b.dirs.forEach((d, j) => {
        const dist = b.r * (1 + ease * 1.7);
        dummy.position.set(d.x * dist * s, (d.y * dist - pu * pu * 30) * s, 0);
        dummy.scale.setScalar(Math.max(2.2, b.r * 0.09) * s * (1 - pu * 0.6));
        dummy.updateMatrix();
        inst.setMatrixAt(j, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;

      // Hearts drift up and wobble; sparkles spin outward.
      extras.current[i].forEach((e, k) => {
        if (!e) return;
        const show = b.hearts || b.sparkle;
        e.visible = show;
        if (!show) return;
        e.material = b.hearts ? pinkMat : sparkleMat;
        e.geometry = b.hearts ? heartGeo : sparkleGeo;
        const spread = (k - (EXTRAS - 1) / 2) * 0.9;
        const pop = u < 0.2 ? u / 0.2 : 1 - Math.max(0, (u - 0.6) / 0.4);
        const size = (b.hearts ? 9 : 7) * pop;
        if (b.hearts) {
          e.position.set((spread * 22 + Math.sin(u * 9 + k) * 6) * s, (u * 90 + k * 8) * s, 0.2);
          e.rotation.set(0, Math.sin(u * 6 + k) * 0.6, spread * 0.2);
        } else {
          const a = (k / EXTRAS) * Math.PI * 2 + 0.4;
          const dist = b.r * (0.6 + u * 1.6);
          e.position.set(Math.cos(a) * dist * s, Math.sin(a) * dist * s, 0.2);
          e.rotation.set(0, 0, u * 4 + k);
        }
        e.scale.setScalar(Math.max(size * s, 1e-4));
      });
    });
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
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
            material={mats[i].ring}
          >
            <torusGeometry args={[1, 0.03, 8, 64]} />
          </mesh>
          <instancedMesh
            ref={(m) => {
              drops.current[i] = m;
            }}
            args={[undefined, mats[i].drop, DROPS]}
            frustumCulled={false}
          >
            <sphereGeometry args={[1, 10, 8]} />
          </instancedMesh>
          {Array.from({ length: EXTRAS }, (_, k) => (
            <mesh
              key={k}
              ref={(m) => {
                extras.current[i][k] = m;
              }}
              geometry={heartGeo}
              material={pinkMat}
              visible={false}
            />
          ))}
        </group>
      ))}
    </>
  );
}
