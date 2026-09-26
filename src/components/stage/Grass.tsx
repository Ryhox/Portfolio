"use client";
/* eslint-disable react-hooks/immutability -- uniforms are driven every frame. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { stage } from "@/lib/stage";
import { catHeight, toWorld, unitsPerPx, view } from "./view";

// The meadow the page ends on: a few hundred blades along the garden floor, the flowers grow out of it.
// Gusts of wind roll across it, it parts around the cat and leans after the wand. All of the motion is in
// the vertex shader; per frame only a handful of uniforms change.

const BLADES = 460;

const vertex = /* glsl */ `
  attribute vec4 aBlade; // x (fraction of the width), height (px), lean, seed
  uniform vec3 uLeft;
  uniform vec3 uRight;
  uniform float uPx;
  uniform float uTime;
  uniform float uGrow;
  uniform vec3 uCat;   // x (fraction), push, reach (fraction)
  uniform vec3 uWand;  // x (fraction), strength, sideways speed
  varying float vT;
  varying float vSeed;
  void main() {
    float f = aBlade.x;
    float t = position.y;
    float h = aBlade.y * uPx * uGrow;
    float w = (3.0 + aBlade.w * 3.5) * uPx;
    // Wind: a slow swell travelling across, sharper gusts now and then, and a little flutter.
    float swell = sin(uTime * 1.2 - f * 8.0) * 0.5 + 0.5;
    float gust = pow(max(0.0, sin(uTime * 0.42 - f * 3.2)), 6.0);
    float bend = aBlade.z + swell * 0.22 + gust * 0.7 + sin(uTime * 3.3 + aBlade.w * 40.0) * 0.05;
    // The cat parts the grass where it stands; the wand drags it along.
    float dc = f - uCat.x;
    bend += sign(dc) * exp(-(dc * dc) / (uCat.z * uCat.z)) * uCat.y * 1.2;
    float dw = f - uWand.x;
    bend += exp(-(dw * dw) / 0.0012) * uWand.y * uWand.z;
    bend = clamp(bend, -1.3, 1.3);
    float k = t * t;
    vec3 p = mix(uLeft, uRight, f);
    p.x += position.x * w * (1.0 - t * 0.9) + bend * h * k * 0.75;
    p.y += h * t * (1.0 - 0.3 * abs(bend) * k);
    p.z += (aBlade.w - 0.5) * 0.5;
    vT = t;
    vSeed = aBlade.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

// Flat and fresh: deep green at the root, sunny yellow-green at the tip, each blade a little different.
const fragment = /* glsl */ `
  varying float vT;
  varying float vSeed;
  void main() {
    vec3 root = mix(vec3(0.16, 0.46, 0.22), vec3(0.2, 0.52, 0.3), vSeed);
    vec3 tip = mix(vec3(0.55, 0.84, 0.34), vec3(0.76, 0.93, 0.45), fract(vSeed * 7.0));
    vec3 col = mix(root, tip, smoothstep(0.0, 1.0, vT));
    col += vec3(1.0, 1.0, 0.9) * smoothstep(0.85, 1.0, vT) * 0.12;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Deterministic meadow (same blades every visit, and pure for React).
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

export default function Grass() {
  const { geometry, material } = useMemo(() => {
    const blade = new THREE.PlaneGeometry(1, 1, 1, 4);
    blade.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = blade.index;
    g.setAttribute("position", blade.getAttribute("position"));
    const rnd = seeded(20260926);
    const data = new Float32Array(BLADES * 4);
    for (let i = 0; i < BLADES; i++) {
      const tall = rnd() < 0.12;
      data.set([(i + rnd()) / BLADES, tall ? 34 + rnd() * 22 : 14 + rnd() * 20, (rnd() - 0.5) * 0.5, rnd()], i * 4);
    }
    g.setAttribute("aBlade", new THREE.InstancedBufferAttribute(data, 4));
    g.instanceCount = BLADES;
    const m = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.DoubleSide,
      uniforms: {
        uLeft: { value: new THREE.Vector3() },
        uRight: { value: new THREE.Vector3() },
        uPx: { value: 0.01 },
        uTime: { value: 0 },
        uGrow: { value: 0 },
        uCat: { value: new THREE.Vector3(-1, 0, 0.05) },
        uWand: { value: new THREE.Vector3(-1, 0, 0) },
      },
    });
    return { geometry: g, material: m };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const mesh = useRef<THREE.Mesh>(null);
  const grow = useRef(0);

  useFrame((state, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 1 / 30);
    const vw = view.vw;
    const y = stage.floorY + 3;
    const on = y < view.vh + 80;
    m.visible = on && grow.current > 0.001;
    // The meadow springs up the first time it comes into view (and on every visit back).
    grow.current = on ? Math.min(1, grow.current + dt * 1.6) : 0;
    if (!on) return;
    const u = material.uniforms;
    toWorld(0, y, u.uLeft.value);
    toWorld(vw, y, u.uRight.value);
    u.uPx.value = unitsPerPx(vw / 2, y);
    u.uTime.value = state.clock.elapsedTime;
    const g = grow.current;
    u.uGrow.value = g < 1 ? 1 + 2.70158 * Math.pow(g - 1, 3) + 1.70158 * Math.pow(g - 1, 2) : 1;

    const cat = stage.cat;
    const onGround = cat.visible && !cat.airborne && Math.abs(cat.y - stage.floorY) < 40;
    const catVec = u.uCat.value as THREE.Vector3;
    catVec.x = cat.x / vw;
    catVec.y += ((onGround ? 1 : 0) - catVec.y) * Math.min(1, dt * 6);
    catVec.z = (catHeight(vw) * 0.8) / vw;
    const wand = stage.wand;
    const low = wand.active && wand.y > stage.floorY - 140 ? 1 : 0;
    const wandVec = u.uWand.value as THREE.Vector3;
    wandVec.x = wand.x / vw;
    wandVec.y += (low - wandVec.y) * Math.min(1, dt * 8);
    wandVec.z += (THREE.MathUtils.clamp(wand.vx / 700, -1.2, 1.2) - wandVec.z) * Math.min(1, dt * 6);
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} visible={false} renderOrder={1} />;
}
