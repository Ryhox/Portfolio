import * as THREE from "three";

// A soft rig without bones: body regions (legs, head, ears, tail, rear) are found by position in the
// model (feet at y = 0, facing +z) and moved in the vertex shader.
//   head: z > 0.12, y > 0.28 — rotates around the neck (0, 0.36, 0.14)
//   ears: the very top of the head (y > 0.5)
//   tail: z < -0.17, sticks straight back — curls up / swishes around its base (0, 0.24, -0.17)
//   rear: z < 0.05 — lowers for sitting, wiggles before a pounce
const RIG_HEAD = /* glsl */ `
  uniform float uPhase;
  uniform float uRun;
  uniform float uTuck;
  uniform float uTime;
  uniform vec3 uHead;   // yaw, pitch, roll
  uniform vec2 uEars;   // left / right flick
  uniform vec3 uTail;   // up-curl, swish amplitude, swish phase
  uniform float uSit;
  uniform float uWiggle;
  uniform float uBreath;
  mat3 rigRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rigRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rigRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

  // p: position in feet-at-zero model space; n: normal, rotated along with the moving parts.
  vec3 catRig(vec3 p, inout vec3 n) {
    // Breathing: the belly swells a touch.
    float bodyW = smoothstep(-0.2, -0.1, p.z) * (1.0 - smoothstep(0.14, 0.24, p.z));
    p.x *= 1.0 + uBreath * 0.022 * bodyW;
    p.y = 0.18 + (p.y - 0.18) * (1.0 + uBreath * 0.012 * bodyW);

    // Legs: diagonal pairs swing and lift (front legs z≈0.22, hind legs z≈-0.05), tuck in the air.
    float legW = 1.0 - smoothstep(0.03, 0.15, p.y);
    float side = clamp(p.x / 0.06, -1.0, 1.0);
    float fb = clamp((p.z - 0.08) / 0.1, -1.0, 1.0);
    float swing = sin(uPhase) * side * fb;
    float lift = max(0.0, cos(uPhase) * side * fb);
    p.z += swing * 0.085 * legW * uRun;
    p.y += lift * 0.05 * legW * uRun;
    p.y += legW * uTuck * 0.05;
    p.z -= legW * uTuck * fb * 0.035;

    // Rear: sits down (hindquarters lower) and wiggles before a pounce.
    float rearW = 1.0 - smoothstep(-0.16, 0.08, p.z);
    p.y -= uSit * rearW * p.y * 0.42;
    p.z += uSit * rearW * 0.035;
    p.x += uWiggle * rearW * sin(uTime * 26.0) * 0.035 * smoothstep(0.02, 0.2, p.y);

    // Tail: curls up from its base and swishes calmly (only a little lag toward the tip).
    float tailW = 1.0 - smoothstep(-0.26, -0.15, p.z);
    float d = clamp((-0.17 - p.z) / 0.36, 0.0, 1.0);
    vec3 tp = vec3(0.0, 0.24 - uSit * 0.1, -0.17);
    mat3 tr = rigRotY(uTail.y * sin(uTail.z - d * 0.7) * (0.55 + 0.45 * d)) * rigRotX(uTail.x * (0.45 + 0.95 * d));
    p = mix(p, tp + tr * (p - tp), tailW);
    n = normalize(mix(n, tr * n, tailW));

    // Ears flick outward (each side on its own), then the whole head turns / nods / tilts.
    float headW = smoothstep(0.13, 0.24, p.z) * smoothstep(0.28, 0.38, p.y);
    float earW = smoothstep(0.49, 0.56, p.y) * headW;
    float ear = p.x < 0.0 ? uEars.x : uEars.y;
    p.x += sign(p.x) * earW * ear * 0.03;
    p.y -= earW * ear * 0.018;
    p.z -= earW * ear * 0.02;
    vec3 np = vec3(0.0, 0.38, 0.27);
    mat3 hr = rigRotY(uHead.x) * rigRotX(uHead.y) * rigRotZ(uHead.z);
    p = mix(p, np + hr * (p - np), headW);
    n = normalize(mix(n, hr * n, headW));
    return p;
  }
`;

// Normals are set up before positions in three's vertex shader, so the rig runs once there and the
// deformed position is reused for "transformed".
const RIG_NORMAL = (halfH: number) => /* glsl */ `
  vec3 objectNormal = vec3(normal);
  vec3 rigPos = catRig(vec3(position.x, position.y + ${halfH.toFixed(4)}, position.z), objectNormal);
`;
const RIG_POSITION = (halfH: number) => /* glsl */ `
  vec3 transformed = vec3(rigPos.x, rigPos.y - ${halfH.toFixed(4)}, rigPos.z);
`;

// Bakes the cat mesh (feet at y = 0, centered, pivot at the body center) and builds its rigged material.
export function buildCatRig(scene: THREE.Object3D) {
  let src: THREE.Mesh | null = null;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
  });
  const mesh = src as unknown as THREE.Mesh;
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  // Feet on y = 0 and centered in x/z, so the gait shader can work in model space.
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const h = geo.boundingBox!.max.y;
  geo.translate(0, -h / 2, 0); // pivot at the body center for tumbles and squash

  const u = {
    uPhase: { value: 0 },
    uRun: { value: 0 },
    uTuck: { value: 0 },
    uTime: { value: 0 },
    uHead: { value: new THREE.Vector3() },
    uEars: { value: new THREE.Vector2() },
    uTail: { value: new THREE.Vector3(0.3, 0.15, 1.6) },
    uSit: { value: 0 },
    uWiggle: { value: 0 },
    uBreath: { value: 0 },
  };
  const map = (mesh.material as THREE.MeshBasicMaterial).map;
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.72, metalness: 0, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    // Positions were re-centered on the body; the rig works in feet-at-zero space.
    shader.vertexShader =
      RIG_HEAD +
      shader.vertexShader
        .replace("#include <beginnormal_vertex>", RIG_NORMAL(h / 2))
        .replace("#include <begin_vertex>", RIG_POSITION(h / 2));
  };
  return { geometry: geo, material: mat, modelH: h, uniforms: u };
}

export type CatRig = ReturnType<typeof buildCatRig>;
