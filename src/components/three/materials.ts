import * as THREE from "three";

// Shared clock for all holographic materials (advanced once per frame in Scene).
export const holoUniforms = {
  uTime: { value: 0 },
  uPink: { value: new THREE.Color("#ee84cf") },
  uViolet: { value: new THREE.Color("#8a73ee") },
  uBlue: { value: new THREE.Color("#6ea5f6") },
};

const HOLO_HEAD = /* glsl */ `
  uniform float uTime;
  uniform vec3 uPink;
  uniform vec3 uViolet;
  uniform vec3 uBlue;
  uniform float uRimStrength;
  uniform float uClear;
  uniform float uFilm;

  vec3 holoPalette(float t) {
    t = fract(t);
    if (t < 0.3333) return mix(uPink, uViolet, t * 3.0);
    if (t < 0.6666) return mix(uViolet, uBlue, (t - 0.3333) * 3.0);
    return mix(uBlue, uPink, (t - 0.6666) * 3.0);
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
  outgoingLight += vec3(1.0) * (spotA * 1.2 + spotB * 1.4) + vec3(1.0, 0.96, 1.0) * spotSoft * 0.12;

  // Thin bright edge line, like polished glass.
  outgoingLight += vec3(1.0, 0.97, 1.0) * smoothstep(0.9, 0.985, hFr) * 0.28;

  // Soap film: see-through in the middle, opaque only at the rim and in the highlights.
  float hAlpha = uFilm > 0.5
    ? clamp(0.05 + hRim * 0.85 + max(spotA, spotB) * 0.9 + spotSoft * 0.12, 0.0, 1.0)
    : diffuseColor.a;
  gl_FragColor = vec4(outgoingLight, hAlpha);
`;

type HoloOptions = {
  color?: string;
  rim?: number;
  clear?: boolean;
  roughness?: number;
  envMapIntensity?: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
  film?: boolean;
};

export function createHolo({
  color = "#f4eeff",
  rim = 0.9,
  clear = false,
  roughness = 0.06,
  envMapIntensity = 1,
  transmission = 0,
  thickness = 0.5,
  ior = 1.4,
  film = false,
}: HoloOptions = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0,
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
  const local = { uRimStrength: { value: rim }, uClear: { value: clear ? 1 : 0 }, uFilm: { value: film ? 1 : 0 } };
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
// Milky see-through charms (hearts, stars, moon...).
export const createCharmMaterial = () =>
  createHolo({ color: "#f1e7ff", rim: 0.95, transmission: 0.45, thickness: 1.4, ior: 1.4, roughness: 0.1, envMapIntensity: 1.6 });
// Crystal-clear soap bubbles with an iridescent rim.
export const createBubbleMaterial = () =>
  createHolo({ color: "#ffffff", rim: 1, clear: true, transmission: 1, thickness: 0.35, ior: 1.2, roughness: 0.08, envMapIntensity: 1.2 });
// Soap film that works on a transparent canvas over the DOM (no transmission pass needed).
export const createFilmMaterial = () =>
  createHolo({ color: "#ffffff", rim: 1, clear: true, film: true, roughness: 0.04, envMapIntensity: 1.5 });
