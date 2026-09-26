"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { createLetterMaterial } from "./materials";
import { buildGlyph } from "./letters";
import { world } from "./world";
import { scroll } from "@/lib/scroll";
import { intro } from "@/lib/intro";
import { stage } from "@/lib/stage";

const WORD = "ryhox";
type Letter = { geo: THREE.BufferGeometry; x: number; w: number; top: number };

// The cat perches on top of this letter ("o").
const PERCH_LETTER = 3;

export default function HeroTitle() {
  const material = useMemo(() => createLetterMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const { letters, width } = useMemo(() => {
    const out: Letter[] = [];
    let cursor = 0;
    const gap = 0.06;
    for (const ch of WORD) {
      // Flat puffy stickers, built like the charms (see letters.ts).
      const geo = buildGlyph(ch);
      const bb = geo.boundingBox!;
      const w = bb.max.x - bb.min.x;
      // Glyph origin sits mid x-height so each letter wobbles around its own middle.
      geo.translate(0, -0.5, 0);
      geo.computeBoundingBox();
      out.push({ geo, x: cursor + w / 2, w, top: geo.boundingBox!.max.y });
      cursor += w + gap;
    }
    const total = cursor - gap;
    out.forEach((l) => (l.x -= total / 2));
    return { letters: out, width: total };
  }, []);

  const root = useRef<THREE.Group>(null);
  const word = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const letterRefs = useRef<(THREE.Mesh | null)[]>([]);
  const bumps = useRef(letters.map(() => ({ v: 0, x: 0 })));
  const perchPoint = useMemo(() => new THREE.Vector3(), []);
  // Per-letter dodge offset away from the pointer.
  const dodges = useRef(letters.map(() => new THREE.Vector2()));
  const pointerWorld = useMemo(() => new THREE.Vector3(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);

  const onLetterOver = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    bumps.current[i].v += 7;
  };

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const d = Math.min(dt, 1 / 30);
    if (!root.current || !word.current) return;

    // Wide screens: half the width. Phones: most of it, leaving room for the ring (1.2× the word).
    const share = world.W < 3 ? 0.72 : 0.5;
    const fit = Math.min((world.W * 2 * share) / width, (world.H * 2 * 0.36) / 2.4, 1.2);
    word.current.scale.setScalar(fit);

    // Explosion progress: the hero is taller than the screen, the word stays put while it blows apart.
    const range = scroll.vh * 0.5;
    const e = THREE.MathUtils.clamp(scroll.y / range, 0, 1);
    const ee = e * e * (3 - 2 * e);
    // Centred on the screen (a hair high: the nav takes the top, the scroll cue the bottom).
    root.current.position.y = world.H * 0.03 + Math.max(0, scroll.y - range) * world.pxToWorld;
    root.current.visible = e < 0.999;

    // Intro: letters drop in with a bounce once the preloader lifts.
    const it = performance.now() / 1000 - intro.at;

    const px = state.pointer.x;
    const py = state.pointer.y;
    // A slow sway on top of the pointer tilt, so the reflections keep sliding over the chrome.
    word.current.rotation.y = THREE.MathUtils.damp(word.current.rotation.y, (px * 0.22 + Math.sin(t * 0.45) * 0.2) * (1 - ee), 3, d);
    word.current.rotation.x = THREE.MathUtils.damp(word.current.rotation.x, (-py * 0.14 + Math.sin(t * 0.31) * 0.07) * (1 - ee), 3, d);

    // Pointer on the word plane, in word-local units.
    state.raycaster.setFromCamera(state.pointer, state.camera);
    const hit = state.raycaster.ray.intersectPlane(plane, pointerWorld);
    if (hit) word.current.worldToLocal(pointerWorld);

    letters.forEach((l, i) => {
      const m = letterRefs.current[i];
      if (!m) return;
      // Letters lean away from the cursor like something liquid being poked.
      const dg = dodges.current[i];
      let tx = 0;
      let ty = 0;
      if (hit) {
        const dx = l.x - pointerWorld.x;
        const dy = -pointerWorld.y;
        const dist = Math.hypot(dx, dy);
        const push = Math.max(0, 1 - dist / 1.3) ** 2 * 0.55 * (1 - ee);
        tx = (dx / (dist || 1)) * push;
        ty = (dy / (dist || 1)) * push;
      }
      dg.x = THREE.MathUtils.damp(dg.x, tx, 6, d);
      dg.y = THREE.MathUtils.damp(dg.y, ty, 6, d);
      const b = bumps.current[i];
      b.v += (-b.x * 90 - b.v * 9) * d;
      b.x += b.v * d;

      // Intro: each letter is blown out of the popping bubble straight at the viewer, then snaps home.
      const u = THREE.MathUtils.clamp((it - i * 0.07) / 1.3, 0, 1);
      const home = easeOutBack(u);
      const spin = Math.pow(1 - u, 4);
      const fly = 1 - home;
      const inX = (l.x * 0.2 - l.x) * fly;
      const inY = (i % 2 ? 0.9 : -0.7) * fly;
      const inZ = 6.5 * fly;

      const ex = EXPLODE[i % EXPLODE.length];
      const bob = Math.sin(t * 1.4 + i * 0.9) * 0.06;
      m.position.set(
        l.x + dg.x + inX + ex.x * ee * width * 0.45,
        bob + dg.y + inY + ex.y * ee * 3.2,
        inZ + ex.z * ee * 9,
      );
      m.rotation.set(
        ex.rx * ee * 3 - ex.rx * spin * 2.2,
        ex.ry * ee * 3 + ex.ry * spin * 2.6,
        Math.sin(t * 0.9 + i * 1.3) * 0.04 + b.x * 0.15 + (i % 2 ? 1 : -1) * spin * 1.4,
      );
      const pop = u > 0 ? 1 : 0;
      m.scale.set(pop * (1 + b.x * 0.5), pop * (1 - b.x * 0.35), pop * (1 + b.x * 0.3));
    });

    // Publish the top of the "o" in screen px so the cat (on the stage canvas) can stand on it.
    const o = letterRefs.current[PERCH_LETTER];
    if (o) {
      o.updateWorldMatrix(true, false);
      perchPoint.set(0, letters[PERCH_LETTER].top - 0.02, 0).applyMatrix4(o.matrixWorld).project(state.camera);
      const px = ((perchPoint.x + 1) / 2) * state.size.width;
      const py = ((1 - perchPoint.y) / 2) * state.size.height;
      const p = stage.perch;
      if (d > 0) {
        p.vx = (px - p.x) / d;
        p.vy = (py - p.y) / d;
      }
      p.x = px;
      p.y = py;
      const landed = it - PERCH_LETTER * 0.08 > 1.25;
      p.valid = landed && e < 0.035 && root.current.visible;
    }

    if (ring.current) {
      // The popped membrane snaps back into the ring: it starts beyond the screen and contracts.
      const ru = THREE.MathUtils.clamp((it - 0.05) / 1.5, 0, 1);
      const rs = it < 0 ? 0 : (4.4 - 3.4 * easeOutElastic(ru)) * (1 + ee * 2.6);
      ring.current.scale.setScalar(Math.max(rs, 0.0001));
      ring.current.rotation.z = t * 0.12 + ee * 2;
      ring.current.rotation.x = Math.PI / 2 - 0.32 + Math.sin(t * 0.5) * 0.04 - ee * 0.9;
      ring.current.position.z = ee * 4;
    }
  });

  return (
    <group ref={root}>
      <group ref={word}>
        {letters.map((l, i) => (
          <mesh
            key={i}
            ref={(m) => {
              letterRefs.current[i] = m;
            }}
            geometry={l.geo}
            material={material}
            onPointerOver={onLetterOver(i)}
          />
        ))}
        <mesh ref={ring} material={material}>
          <torusGeometry args={[width * 0.6, 0.035, 24, 220]} />
        </mesh>
      </group>
    </group>
  );
}

// Where each letter flies when the hero blows apart (x in word widths, z toward the camera).
const EXPLODE = [
  { x: -1.6, y: 0.9, z: 0.55, rx: 0.7, ry: -1.1 },
  { x: -0.7, y: -1.3, z: 0.8, rx: -1.2, ry: 0.6 },
  { x: 0.1, y: 1.4, z: 1.0, rx: 1.4, ry: 0.3 },
  { x: 0.8, y: -1.1, z: 0.75, rx: -0.6, ry: 1.3 },
  { x: 1.7, y: 0.8, z: 0.6, rx: 0.9, ry: -0.8 },
];

function easeOutElastic(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return Math.pow(2, -9 * x) * Math.sin((x * 9 - 0.75) * ((2 * Math.PI) / 3.4)) + 1;
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

