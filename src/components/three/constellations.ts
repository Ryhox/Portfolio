// One constellation per ability (see abilities in content.ts). Each is a figure you can recognise, and the
// tools sit where the lines between them mean something (built on, runs on, feeds into). Coordinates are
// in a local chart spanning roughly [-1, 1] (x right, y up); z only matters for the cube, which turns as
// a real 3D wireframe. Edges are listed in drawing order.

// key: a main tool (big label). lang: a programming language (marked as such).
export type Star = { p: [number, number, number]; mag: number; label?: string; key?: boolean; lang?: boolean };
export type Figure = {
  // How the figure lives once it's drawn (see figPose in AboutSky).
  kind: "cube" | "phone" | "network" | "pickaxe" | "plane";
  stars: Star[];
  edges: [number, number][];
  // Edges drawn dashed (a flight path).
  dashed?: number[];
  // Star paths a spark of light keeps running along once the figure is complete.
  flows?: number[][];
};

const s = (x: number, y: number, mag = 0.5, label?: string, z = 0): Star => ({ p: [x, y, z], mag, label });
const KEY = new Set(["Three.js", "React Three Fiber", "Next.js", "React", "TypeScript", "JavaScript", "Flutter", "Node.js", "Ollama", "Java", "C#", "GSAP", "GLSL"]);
const LANG = new Set(["TypeScript", "JavaScript", "GLSL", "Java", "Kotlin", "C#"]);

// 3D worlds: a cube. The front face is the stack from the metal up: WebGL, Three.js on top of it, React
// Three Fiber wrapping that, and GLSL, the shaders that run on WebGL. The back face is its depth.
const c = 0.58;
const cube: Figure = {
  kind: "cube",
  stars: [
    s(-c, -c, 1, "WebGL", -c),
    s(-c, c, 1, "Three.js", -c),
    s(c, c, 1, "React Three Fiber", -c),
    s(c, -c, 1, "GLSL", -c),
    s(-c, -c, 0.45, undefined, c),
    s(-c, c, 0.45, undefined, c),
    s(c, c, 0.45, undefined, c),
    s(c, -c, 0.45, undefined, c),
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
  ],
};

// Everyday apps: a flip phone. The lid is the web stack, drawn in order: React, Next.js built on it,
// TypeScript holding it together at the hinge. Flutter is the round button on the keypad: the same apps,
// native on the phone. The antenna blips.
const r = 0.17;
const phone: Figure = {
  kind: "phone",
  stars: [
    s(-0.42, 0.7, 1, "React"),
    s(0.42, 0.7, 1, "Next.js"),
    s(0.42, 1.0, 0.4),
    s(0.46, -0.02, 1, "TypeScript"),
    s(-0.46, -0.02, 0.5),
    s(-0.44, -0.9, 0.5),
    s(0.44, -0.9, 0.5),
    s(0, -0.44, 1, "Flutter"),
    s(0, -0.44 + r, 0.35),
    s(r, -0.44, 0.35),
    s(0, -0.44 - r, 0.35),
    s(-r, -0.44, 0.35),
  ],
  edges: [
    [0, 1],
    [1, 3],
    [3, 4],
    [4, 0],
    [1, 2],
    [4, 5],
    [5, 6],
    [6, 3],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 8],
  ],
  flows: [[1, 2]],
};

// AI & backends: a neural network. Data on the left (the databases), the backend in the middle (Node.js,
// running JavaScript), and the model it all feeds on the right (Ollama). Sparks run through it.
const network: Figure = {
  kind: "network",
  stars: [
    s(-0.88, 0.44, 0.9, "PostgreSQL"),
    s(-0.88, -0.44, 0.9, "MySQL"),
    s(0, 0.76, 1, "JavaScript"),
    s(0, 0, 1, "Node.js"),
    s(0, -0.76, 0.5),
    s(0.88, 0, 1, "Ollama"),
  ],
  edges: [
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 5],
    [3, 5],
    [4, 5],
  ],
  flows: [
    [0, 3, 5],
    [1, 2, 5],
    [0, 4, 5],
    [1, 3, 5],
  ],
};

// Mods & hardware: a pickaxe, because Minecraft. The head is the modding toolchain: Kotlin and Java (both
// on the JVM) and Fabric, the point that digs in. The handle runs down to C# and Arduino, the part you
// hold: the things that don't live in a browser. It keeps on mining.
const at = (deg: number, rad: number, mag = 0.45, label?: string) => {
  const a = (deg * Math.PI) / 180;
  return s(-0.3 + Math.cos(a) * rad, -0.3 + Math.sin(a) * rad, mag, label);
};
const pickaxe: Figure = {
  kind: "pickaxe",
  stars: [
    at(105, 1.12, 0.9, "Kotlin"),
    at(75, 1.12),
    at(45, 1.12, 1, "Java"),
    at(15, 1.12),
    at(-15, 1.12, 0.9, "Fabric"),
    at(10, 0.84, 0.4),
    at(45, 0.84, 0.5),
    at(80, 0.84, 0.4),
    s(-0.24, -0.24, 1, "C#"),
    s(-0.84, -0.84, 0.9, "Arduino"),
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 0],
    [6, 8],
    [8, 9],
  ],
};

// Motion & feel: a paper plane and its flight path, which is how this site moves: Lenis smooths the
// scroll, ScrollTrigger turns it into progress, GSAP flies the thing. A spark keeps running down the path.
const plane: Figure = {
  kind: "plane",
  stars: [
    s(-0.94, -0.46, 0.9, "Lenis"),
    s(-0.62, -0.76, 0.4),
    s(-0.26, -0.54, 0.9, "ScrollTrigger"),
    s(-0.02, -0.1, 0.4),
    s(0.2, 0.16, 0.4),
    s(0.4, 0.3, 0.55),
    s(0.94, 0.7, 1, "GSAP"),
    s(0.34, 0.9, 0.55),
    s(0.54, 0.54, 0.5),
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 5],
    [8, 6],
  ],
  dashed: [0, 1, 2, 3, 4],
  flows: [[0, 1, 2, 3, 4, 5, 6]],
};

export const FIGURES: Figure[] = [cube, phone, network, pickaxe, plane];
for (const f of FIGURES)
  for (const st of f.stars) {
    if (!st.label) continue;
    st.key = KEY.has(st.label);
    st.lang = LANG.has(st.label);
    if (st.key) st.mag = Math.max(st.mag, 1);
  }
