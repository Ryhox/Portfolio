"use client";
/* eslint-disable react-hooks/immutability -- the wand, its film and its trail are driven imperatively every frame. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { stage } from "@/lib/stage";
import { createCharmMaterial, createFilmMaterial } from "../three/materials";
import { puffy, sparkleShape } from "../three/shapes";
import { toWorld, unitsPerPx } from "./view";

// The bubble wand in 3D: an iridescent chrome ring on a chrome handle with a star charm, and a real soap
// film across the ring. It follows the pointer in the garden (see Wand.tsx) on springs: the ring turns
// into the wind as you wave it, the film balloons out behind, and it trails a stream of tiny bubbles and
// chrome glints. A click makes it puff.

const R = 24; // ring radius, px

// The soap film across the ring: see-through, with slowly swirling rainbow bands (the film's thickness
// shifting), a brighter edge where it clings to the ring and a glossy highlight. Positions are in px
// around the ring's centre, so the same shader works flat and when the film balloons out.
const filmVert = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy / ${(R - 0.8).toFixed(1)};
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const filmFrag = /* glsl */ `
  uniform float uTime;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float swirl = sin(vP.x * 3.2 + uTime * 1.1 + sin(vP.y * 4.0 - uTime * 0.8) * 1.4) * 0.35
      + sin(r * 7.0 - uTime * 1.6) * 0.25 + vP.y * 0.4;
    vec3 rainbow = 0.55 + 0.45 * cos(6.28318 * (swirl + vec3(0.0, 0.33, 0.67)));
    vec3 col = mix(vec3(1.0), rainbow, 0.7);
    float edge = smoothstep(0.7, 1.0, r);
    float shine = smoothstep(0.34, 0.0, length(vP - vec2(-0.36, 0.38)));
    float a = 0.2 + edge * 0.35 + shine * 0.45;
    gl_FragColor = vec4(mix(col, vec3(1.0), shine * 0.8), a);
  }
`;
const MICRO = 120;
const GLINTS = 36;

type Bit = { x: number; y: number; vx: number; vy: number; r: number; age: number; life: number; spin: number };
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// A damped spring toward a target (value + velocity), for the wobbly feel.
function spring(s: { v: number; x: number }, target: number, k: number, damp: number, dt: number) {
  s.v += (target - s.x) * k * dt;
  s.v *= Math.exp(-damp * dt);
  s.x += s.v * dt;
  return s.x;
}

export default function Wand3D() {
  const assets = useMemo(() => {
    const ring = new THREE.TorusGeometry(R, 3.4, 20, 72);
    // The film: a dome over the ring (flat at rest), bulging out behind when air goes through.
    const film = new THREE.SphereGeometry(R - 0.8, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    film.rotateX(-Math.PI / 2);
    const handle = new THREE.CylinderGeometry(2.8, 3.2, 78, 16);
    handle.translate(0, -39, 0);
    const bead = new THREE.SphereGeometry(4.6, 20, 14);
    const star = puffy(sparkleShape(), 0.1, 0.12, 0.08);
    const micro = new THREE.SphereGeometry(1, 16, 12);
    const filmMat = new THREE.ShaderMaterial({
      vertexShader: filmVert,
      fragmentShader: filmFrag,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return { ring, film, handle, bead, star, micro, chrome: createCharmMaterial(), soap: createFilmMaterial(), filmMat };
  }, []);
  useEffect(
    () => () => {
      Object.values(assets).forEach((a) => a.dispose());
    },
    [assets],
  );

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const film = useRef<THREE.Mesh>(null);
  const micro = useRef<THREE.InstancedMesh>(null);
  const glints = useRef<THREE.InstancedMesh>(null);
  const state = useRef({
    vx: 0,
    vy: 0,
    lean: { x: 0.42, v: 0 },
    turn: { x: 0, v: 0 },
    tip: { x: 0, v: 0 },
    bulge: { x: 0, v: 0 },
    show: { x: 0, v: 0 },
    budget: 0,
    glintBudget: 0,
    micro: [] as Bit[],
    glints: [] as Bit[],
  });
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), p: new THREE.Vector3() }), []);

  useFrame((frame, rawDt) => {
    const g = root.current;
    const b = body.current;
    const f = film.current;
    const mi = micro.current;
    const gl = glints.current;
    if (!g || !b || !f || !mi || !gl) return;
    const dt = Math.min(rawDt, 1 / 30);
    const t = frame.clock.elapsedTime;
    const s = state.current;
    const w = stage.wand;
    assets.filmMat.uniforms.uTime.value = t;

    // Smoothed pointer velocity (px/s).
    const k = 1 - Math.exp(-dt * 10);
    s.vx += ((w.active ? w.vx : 0) - s.vx) * k;
    s.vy += ((w.active ? w.vy : 0) - s.vy) * k;
    const speed = Math.hypot(s.vx, s.vy);

    // Pops in when the pointer enters the garden, shrinks away when it leaves.
    const show = spring(s.show, w.active ? 1 : 0, 220, 14, dt);
    const px = unitsPerPx(w.x, w.y);
    toWorld(w.x, w.y, g.position);
    g.position.z = 0.6;
    g.scale.setScalar(Math.max(show, 1e-4) * px);

    // The handle trails the motion; the ring turns to face the wind (so the film shows its bulge).
    spring(s.lean, 0.42 - THREE.MathUtils.clamp(s.vx * 0.00035, -0.55, 0.55), 120, 9, dt);
    spring(s.turn, THREE.MathUtils.clamp(s.vx * 0.0009, -1, 1), 90, 8, dt);
    spring(s.tip, THREE.MathUtils.clamp(s.vy * 0.0008, -0.8, 0.8), 90, 8, dt);
    b.rotation.set(s.tip.x, s.turn.x, s.lean.x + Math.sin(t * 1.3) * 0.03);

    // The film balloons with the speed (and a click puffs it right out), then wobbles back.
    const puff = Math.max(0, 1 - (performance.now() / 1000 - w.puff) / 0.5);
    const bulge = spring(s.bulge, Math.min(1, speed / 1500) + puff * 0.9, 160, 7, dt);
    const wob = Math.sin(t * 9) * 0.025 * Math.min(1, speed / 600);
    f.scale.set(1 + wob, 1 - wob, Math.max(0.03, 0.03 + bulge * 0.9));
    b.scale.setScalar(1 + puff * 0.12 * Math.sin(puff * Math.PI * 3));

    // ----- The trail: tiny bubbles streaming off the ring, and chrome glints -----
    const spawn = (list: Bit[], max: number, life: [number, number], r: [number, number], lift: number) => {
      if (list.length >= max) list.shift();
      const a = Math.random() * Math.PI * 2;
      const rr = R * show;
      list.push({
        x: w.x + Math.cos(a) * rr,
        y: w.y + Math.sin(a) * rr,
        vx: -s.vx * 0.14 + rand(-60, 60),
        vy: -s.vy * 0.14 + rand(-60, 60) - lift,
        r: rand(r[0], r[1]),
        age: 0,
        life: rand(life[0], life[1]),
        spin: rand(-6, 6),
      });
    };
    if (w.active && speed > 140) {
      s.budget += (speed * dt) / 10;
      s.glintBudget += (speed * dt) / 55;
    }
    while (s.budget >= 1) {
      s.budget -= 1;
      spawn(s.micro, MICRO, [0.7, 1.3], [2.2, 6], 40);
    }
    while (s.glintBudget >= 1) {
      s.glintBudget -= 1;
      spawn(s.glints, GLINTS, [0.45, 0.8], [5, 9], 10);
    }
    const draw = (list: Bit[], mesh: THREE.InstancedMesh, buoy: number, render: (bit: Bit, u: number) => void) => {
      let n = 0;
      for (const bit of list) {
        bit.age += dt;
        if (bit.age > bit.life) continue;
        bit.vy -= buoy * dt;
        bit.vx *= Math.exp(-1.6 * dt);
        bit.vy *= Math.exp(-1.2 * dt);
        bit.x += bit.vx * dt;
        bit.y += bit.vy * dt;
        list[n++] = bit;
      }
      list.length = n;
      list.forEach((bit, i) => {
        render(bit, bit.age / bit.life);
        tmp.o.updateMatrix();
        mesh.setMatrixAt(i, tmp.o.matrix);
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    };
    // Bubbles swell in, drift up, and shrink to nothing.
    draw(s.micro, mi, 50, (bit, u) => {
      toWorld(bit.x, bit.y, tmp.o.position);
      tmp.o.position.z = 0.4;
      const grow = Math.min(1, u / 0.12) * (1 - Math.max(0, (u - 0.75) / 0.25));
      tmp.o.scale.setScalar(Math.max(bit.r * grow * unitsPerPx(bit.x, bit.y), 1e-5));
      tmp.o.rotation.set(0, 0, 0);
    });
    // Glints twinkle: pop in, spin, pop out.
    draw(s.glints, gl, 0, (bit, u) => {
      toWorld(bit.x, bit.y, tmp.o.position);
      tmp.o.position.z = 0.5;
      tmp.o.scale.setScalar(Math.max(bit.r * Math.sin(Math.PI * u) * unitsPerPx(bit.x, bit.y), 1e-5));
      tmp.o.rotation.set(0, 0, bit.spin * bit.age);
    });
  });

  return (
    <>
      <group ref={root} scale={1e-4}>
        <group ref={body}>
          <mesh geometry={assets.ring} material={assets.chrome} />
          <mesh ref={film} geometry={assets.film} material={assets.filmMat} renderOrder={6} />
          <mesh geometry={assets.bead} material={assets.chrome} position={[0, -R - 2, 0]} />
          <mesh geometry={assets.handle} material={assets.chrome} position={[0, -R - 4, 0]} />
          <mesh geometry={assets.star} material={assets.chrome} position={[0, -R - 88, 0]} scale={10} />
        </group>
      </group>
      <instancedMesh ref={micro} args={[assets.micro, assets.soap, MICRO]} frustumCulled={false} renderOrder={6} />
      <instancedMesh ref={glints} args={[assets.star, assets.chrome, GLINTS]} frustumCulled={false} />
    </>
  );
}
