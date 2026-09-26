import * as THREE from "three";

// Shared clock for all holographic materials (advanced once per frame in Scene).
export const holoUniforms = {
  uTime: { value: 0 },
  uPink: { value: new THREE.Color("#f39bd6") },
  uViolet: { value: new THREE.Color("#9f9cf2") },
  uBlue: { value: new THREE.Color("#6cb8f6") },
};

const HOLO_HEAD = /* glsl */ `
  uniform float uTime;
  uniform vec3 uPink;
  uniform vec3 uViolet;
  uniform vec3 uBlue;
  uniform float uRimStrength;
  uniform float uClear;
  uniform float uFilm;
  uniform float uIri;
  uniform float uIriScale;
  uniform float uGloss;

  vec3 holoPalette(float t) {
    t = fract(t);
    if (t < 0.3333) return mix(uPink, uViolet, t * 3.0);
    if (t < 0.6666) return mix(uViolet, uBlue, (t - 0.3333) * 3.0);
    return mix(uBlue, uPink, (t - 0.6666) * 3.0);
  }

  // The iridescent film: pink, gold, cyan, lavender, round again (no green: shadows stay clean).
  vec3 iriPalette(float t) {
    t = fract(t) * 4.0;
    float f = fract(t);
    f = f * f * (3.0 - 2.0 * f);
    vec3 pink = vec3(1.0, 0.45, 0.72);
    vec3 gold = vec3(1.0, 0.78, 0.4);
    vec3 cyan = vec3(0.32, 0.82, 0.92);
    vec3 lav = vec3(0.62, 0.52, 1.0);
    if (t < 1.0) return mix(pink, gold, f);
    if (t < 2.0) return mix(gold, cyan, f);
    if (t < 3.0) return mix(cyan, lav, f);
    return mix(lav, pink, f);
  }
`;

// Pale pearly core, saturated pink/violet/blue fresnel rim, liquid ripples.
const HOLO_BODY = /* glsl */ `
  vec3 hV = normalize(vViewPosition);
  vec3 hN = normalize(normal);
  float hFr = 1.0 - clamp(dot(hN, hV), 0.0, 1.0);
  float hRim = uClear > 0.5 ? smoothstep(0.3, 0.97, hFr) : smoothstep(0.12, 0.9, hFr);

  float hT = hFr * 1.35 + hN.y * 0.32 - hN.x * 0.22 + uTime * 0.025;
  vec3 hCol = holoPalette(hT);

  // Iridescent chrome (Y2K sparkle): a pastel rainbow of pink, gold, cyan and lavender sweeps across the
  // whole silver body, following the reflection, so the bands slide as the object turns. Bright parts go
  // pearly white, the middle carries the colour, the shadows keep it deep.
  if (uIri > 0.0) {
    vec3 hRr = reflect(-hV, hN);
    float it = (hFr * 1.3 + hRr.y * 0.6 + hRr.x * 0.35 + hN.x * 0.2) * uIriScale + uTime * 0.02;
    vec3 iri = iriPalette(it);
    float lum = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
    vec3 film = iri * (0.28 + lum * 1.05) + vec3(1.0) * smoothstep(0.75, 1.3, lum) * 0.35;
    outgoingLight = mix(outgoingLight, film, uIri);
  }

  // Rim takes the holo colour, slightly deepened; the core stays milky and lit.
  vec3 rimCol = hCol * (0.62 + 0.55 * outgoingLight);
  outgoingLight = mix(outgoingLight, rimCol, hRim * uRimStrength);

  // Soft liquid sheen across the face.
  float wave = sin(hN.x * 5.0 + sin(hN.y * 4.0 + uTime * 0.3) * 1.6 + hN.y * 2.0);
  float ripple = smoothstep(0.55, 1.0, wave) * (1.0 - hRim) * 0.08 * (1.0 - uClear);
  outgoingLight += mix(vec3(1.0), hCol, 0.5) * ripple;

  // Glossy hotspots from two fixed studio lights (view space), like the reference highlights.
  vec3 hR = reflect(-hV, hN);
  float spotA = pow(max(dot(hR, normalize(vec3(-0.45, 0.6, 0.66))), 0.0), 90.0);
  float spotB = pow(max(dot(hR, normalize(vec3(0.5, 0.25, 0.83))), 0.0), 260.0);
  float spotSoft = pow(max(dot(hR, normalize(vec3(-0.3, 0.8, 0.5))), 0.0), 12.0);
  outgoingLight += (vec3(1.0) * (spotA * 1.2 + spotB * 1.4) + vec3(1.0, 0.96, 1.0) * spotSoft * 0.12) * uGloss;

  // Thin bright edge line, like polished glass.
  outgoingLight += vec3(1.0, 0.97, 1.0) * smoothstep(0.9, 0.985, hFr) * 0.28 * uGloss;

  // Soap film: see-through in the middle, opaque only at the rim and in the highlights.
  float hAlpha = uFilm > 0.5
    ? clamp(0.05 + hRim * 0.85 + max(spotA, spotB) * 0.9 + spotSoft * 0.12, 0.0, 1.0)
    : diffuseColor.a;
  gl_FragColor = vec4(outgoingLight, hAlpha);
`;

type HoloOptions = {
  color?: string;
  metalness?: number;
  rim?: number;
  clear?: boolean;
  roughness?: number;
  envMapIntensity?: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
  film?: boolean;
  // 0..1: how much of the body carries the iridescent rainbow (0 = only the rim does).
  iridescent?: number;
  // How many rainbow bands fit across the shape (lower = broader, calmer bands).
  iriScale?: number;
  // 0..1: strength of the glossy hotspots (lower = a softer, satin finish).
  gloss?: number;
};

export function createHolo({
  color = "#f4eeff",
  metalness = 0,
  rim = 0.9,
  clear = false,
  roughness = 0.06,
  envMapIntensity = 1,
  transmission = 0,
  thickness = 0.5,
  ior = 1.4,
  film = false,
  iridescent = 0,
  iriScale = 1,
  gloss = 1,
}: HoloOptions = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness,
    roughness,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    envMapIntensity,
    // Real see-through glass: the scene behind is refracted through the body.
    transmission,
    thickness,
    ior,
    transparent: film,
    depthWrite: !film,
  });
  const local = { uRimStrength: { value: rim }, uClear: { value: clear ? 1 : 0 }, uFilm: { value: film ? 1 : 0 }, uIri: { value: iridescent }, uIriScale: { value: iriScale }, uGloss: { value: gloss } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, holoUniforms, local);
    shader.fragmentShader = HOLO_HEAD + shader.fragmentShader.replace("#include <opaque_fragment>", HOLO_BODY);
  };
  mat.customProgramCacheKey = () => `holo-${clear ? "clear" : "solid"}-${film ? "film" : "body"}`;
  return mat;
}

// Puffy lettering: clear glass like the bubbles, a little thicker so it bends the view behind.
export const createHoloMaterial = () =>
  createHolo({ color: "#ffffff", rim: 1, clear: true, transmission: 1, thickness: 0.7, ior: 1.3, roughness: 0.14, envMapIntensity: 1.2 });
// The hero lettering: the moon's iridescent chrome, in the same soft environment, with a little less
// rainbow (more silver).
export const createLetterMaterial = () =>
  createHolo({ color: "#eef0f6", metalness: 1, rim: 0.45, roughness: 0.15, envMapIntensity: 1.2, iridescent: 0.4 });
// Iridescent chrome (the charms, the moon, the stars): pearly silver with a rainbow
// film sliding over it, like Y2K sparkle stickers.
export const createCharmMaterial = () =>
  createHolo({ color: "#eef0f6", metalness: 1, rim: 0.45, roughness: 0.16, envMapIntensity: 1.2, iridescent: 0.9 });
// The same silver, lit from inside too (the stars and the moon at night, when there is little to reflect).
export function createGlowMaterial(glow: string, strength: number) {
  const mat = createCharmMaterial();
  mat.emissive = new THREE.Color(glow);
  mat.emissiveIntensity = strength;
  return mat;
}
// Crystal-clear soap bubbles with an iridescent rim.
export const createBubbleMaterial = () =>
  createHolo({ color: "#ffffff", rim: 1, clear: true, transmission: 1, thickness: 0.35, ior: 1.2, roughness: 0.08, envMapIntensity: 1.2 });
// Soap film that works on a transparent canvas over the DOM (no transmission pass needed).
export const createFilmMaterial = () =>
  createHolo({ color: "#ffffff", rim: 1, clear: true, film: true, roughness: 0.04, envMapIntensity: 1.5 });
