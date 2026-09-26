"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { scroll } from "@/lib/scroll";
import { about } from "@/lib/about";

// The sky behind the whole page: a clear blue day sky with two layers of drifting cumulus, lit by a soft
// sun (bright white tops, blue-grey bellies, see-through edges). The air right above the horizon stays
// clear and blue; the clouds build up higher, and rise past as you scroll (the near layer faster). At the
// very bottom is the meadow the page comes to rest on (its blades are 3D, see stage/Grass). Over the About section night falls (the constellations need it): the blue deepens to
// ink, the clouds go dark and moonlit, and day comes back after.

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
  uniform float uNight;
  uniform float uFloor;
  uniform vec2 uRes;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uLow;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * noise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return s;
  }

  // Cumulus: big shapes where the clouds are, billowy detail on top of them.
  float cloud(vec2 p) {
    float base = fbm(p * 0.55);
    float puff = fbm(p * 1.8 + vec2(base * 1.6, 0.0));
    return base * 0.72 + puff * 0.42;
  }
  // One layer: x = coverage (soft at the edges), y = sunlight reaching it (how much cloud lies between it
  // and the sun, up and to the right). Clear sky costs one lookup.
  vec2 cumulus(vec2 p, float cover, int steps) {
    if (cover <= 0.001) return vec2(0.0);
    float lo = 1.0 - cover;
    float d = cloud(p);
    float a = smoothstep(lo, lo + 0.16, d);
    if (a <= 0.0) return vec2(0.0);
    float depth = 0.0;
    for (int i = 1; i <= 3; i++) {
      if (i > steps) break;
      depth += max(0.0, cloud(p + vec2(0.035, 0.1) * float(i)) - lo);
    }
    return vec2(a, exp(-depth * 3.2));
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uRes.x / uRes.y;
    float night = uNight;

    // Sky: deep at the top, a lighter (still blue) haze toward the horizon.
    vec3 day = mix(uLow, uMid, smoothstep(0.0, 0.55, uv.y));
    day = mix(day, uTop, smoothstep(0.45, 1.0, uv.y));
    vec3 dark = mix(vec3(0.11, 0.16, 0.34), vec3(0.04, 0.07, 0.19), smoothstep(0.0, 0.6, uv.y));
    dark = mix(dark, vec3(0.02, 0.035, 0.11), smoothstep(0.5, 1.0, uv.y));
    vec3 col = mix(day, dark, night);

    // The sun, up in the corner, and the moon's glow at night.
    vec2 q = vec2(uv.x * aspect, uv.y);
    float sun = length(q - vec2(0.84 * aspect, 1.08));
    col += vec3(1.0, 0.97, 0.9) * (exp(-sun * sun * 2.2) * 0.3) * (1.0 - night);
    float moon = length(q - vec2(0.19 * aspect, 0.79));
    col += vec3(0.55, 0.66, 1.0) * exp(-moon * moon * 10.0) * 0.22 * night;

    // Two layers of cloud, wide and puffy, clear near the horizon and building up higher. They rise as
    // you scroll down (parallax) and drift sideways on their own. The far layer is smaller, fainter and
    // takes on the sky's blue (air in between).
    float t = uTime;
    vec2 far = vec2(q.x * 0.75 + t * 0.005, q.y * 1.25 - uScroll * 0.2) * 2.4;
    vec2 near = vec2(q.x * 0.6 + t * 0.011 + 7.3, q.y - uScroll * 0.5 + 2.1) * 1.35;
    vec2 cf = cumulus(far, 0.36 * smoothstep(0.14, 0.5, uv.y), 1);
    vec2 cn = cumulus(near, 0.42 * smoothstep(0.24, 0.62, uv.y), 3);
    vec3 belly = vec3(0.6, 0.68, 0.8);
    vec3 sunlit = vec3(1.0, 0.995, 0.98);
    vec3 cloudFar = mix(mix(mix(belly, sunlit, cf.y), col, 0.3), mix(vec3(0.07, 0.11, 0.25), vec3(0.22, 0.28, 0.5), cf.y), night);
    vec3 cloudNear = mix(mix(belly, sunlit, cn.y), mix(vec3(0.05, 0.08, 0.2), vec3(0.3, 0.36, 0.6), cn.y), night);
    col = mix(col, cloudFar, cf.x * mix(0.7, 0.35, night));
    col = mix(col, cloudNear, cn.x * mix(0.96, 0.5, night));

    // The meadow the page ends on: a soft hazy line of far-off grass behind the floor, then the ground
    // itself, fresh green fading deeper, with a fuzzy fringe of short grass along its top edge.
    float y = (1.0 - uv.y) * uRes.y;
    float x = uv.x * uRes.x;
    float hills = uFloor - 26.0 - fbm(vec2(x / 260.0, 2.0)) * 40.0;
    col = mix(col, vec3(0.62, 0.84, 0.62), smoothstep(hills, hills + 30.0, y) * 0.55);
    float cell = floor(x / 3.0);
    float fringe = uFloor + 2.0 - hash(vec2(cell, 7.0)) * 9.0 * (1.0 - abs(fract(x / 3.0) * 2.0 - 1.0));
    float ground = smoothstep(fringe, fringe + 1.5, y);
    if (ground > 0.0) {
      float depth = y - uFloor;
      float tuft = fbm(vec2(x / 14.0, y / 9.0));
      vec3 grass = mix(vec3(0.45, 0.78, 0.33), vec3(0.24, 0.55, 0.25), smoothstep(0.0, 120.0, depth));
      grass *= 0.9 + tuft * 0.2;
      col = mix(col, grass, ground);
    }

    // Written as sRGB; the renderer expects linear light.
    gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);
    #include <colorspace_fragment>
  }
`;

const srgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const pal = (a: string, b: string, c: string) => [srgb(a), srgb(b), srgb(c)];
// top / middle / low per section: a clear blue day, a little brighter every section down.
const PALETTES: Record<string, THREE.Vector3[]> = {
  hero: pal("#2f7fe2", "#5ea8ef", "#a4d2f7"),
  intro: pal("#2f7fe2", "#5ea8ef", "#a4d2f7"),
  work: pal("#3587e5", "#66aff1", "#acd7f8"),
  contact: pal("#3a8ce7", "#6cb3f2", "#a8d6f8"),
};

// Single fullscreen backdrop, so its uniforms can live at module scope and be animated per frame.
const uniforms = {
  uTime: { value: 0 },
  uScroll: { value: 0 },
  uNight: { value: 0 },
  uFloor: { value: 1e5 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uTop: { value: PALETTES.hero[0].clone() },
  uMid: { value: PALETTES.hero[1].clone() },
  uLow: { value: PALETTES.hero[2].clone() },
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
    uniforms.uLow.value.lerp(pal[2], k);
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uScroll.value = scroll.y / Math.max(1, scroll.vh);
    uniforms.uNight.value = about.vis;
    // Screen y of the floor (px from the top): the cloud bank sits right under the footer's floor line.
    uniforms.uFloor.value = Math.min(1e5, scroll.floor - scroll.y);
    uniforms.uRes.value.set(state.size.width, state.size.height);
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1000} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
