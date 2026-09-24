"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { scroll } from "@/lib/scroll";

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform vec2 uRes;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;

    // Clean vertical night gradient that slowly drifts as you scroll.
    float g = clamp(uv.y + sin(uScroll * 0.9) * 0.08, 0.0, 1.0);
    vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, g));
    col = mix(col, uTop, smoothstep(0.5, 1.0, g));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const pal = (a: string, b: string, c: string) => [new THREE.Color(a), new THREE.Color(b), new THREE.Color(c)];
// top / middle / bottom per section.
const PALETTES: Record<string, THREE.Color[]> = {
  hero: pal("#171029", "#120d22", "#0a0c1c"),
  intro: pal("#1a1030", "#130d26", "#0b0b1e"),
  work: pal("#0d1233", "#0a0e27", "#06081a"),
  contact: pal("#2a1240", "#1b0d2e", "#0e0a1d"),
};

// Single fullscreen backdrop, so its uniforms can live at module scope and be animated per frame.
const uniforms = {
  uTime: { value: 0 },
  uScroll: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uTop: { value: new THREE.Color("#171029") },
  uMid: { value: new THREE.Color("#120d22") },
  uBottom: { value: new THREE.Color("#0a0c1c") },
};

export default function Backdrop() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms,
      }),
    [],
  );

  useFrame((state, dt) => {
    // Blend toward the palette of whichever section fills the screen.
    const probe = scroll.y + scroll.vh * 0.5;
    let pal = PALETTES.hero;
    for (const [name, colors] of Object.entries(PALETTES)) {
      const top = scroll.anchors[name];
      if (top !== undefined && probe >= top) pal = colors;
    }
    const k = 1 - Math.exp(-3 * Math.min(dt, 1 / 30));
    uniforms.uTop.value.lerp(pal[0], k);
    uniforms.uMid.value.lerp(pal[1], k);
    uniforms.uBottom.value.lerp(pal[2], k);
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uScroll.value = scroll.progress * 3;
    uniforms.uRes.value.set(state.size.width, state.size.height);
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1000} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
