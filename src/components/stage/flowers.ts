import * as THREE from "three";
import { butterflyShape, heartShape, puffy, starShape } from "../three/shapes";
import { createHolo } from "../three/materials";

// Y2K glass flowers for the bubble garden. Built in "stem units": the stem is 1 tall, base at the origin.

export type FlowerType = "hearts" | "star" | "tulip" | "daisy" | "flutter";
export const FLOWER_TYPES: FlowerType[] = ["hearts", "star", "tulip", "daisy", "flutter"];

export type Part = {
  geo: THREE.BufferGeometry;
  role: "petal" | "center" | "wing";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

const v = (x: number, y: number) => new THREE.Vector3(x, y, 0);

// Puffy geometry with its base (lowest point) at the origin, for parts that grow from a joint.
function baseAligned(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);
  return geo;
}

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.2, 0.2, 0, 0.5);
  s.quadraticCurveTo(-0.2, 0.2, 0, 0);
  return s;
}

function teardropShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.17, 0.04, 0.15, 0.32, 0, 0.44);
  s.bezierCurveTo(-0.15, 0.32, -0.17, 0.04, 0, 0);
  return s;
}

function build() {
  const stem = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([v(0, -0.02), v(0.05, 0.3), v(-0.04, 0.66), v(0, 1)]),
    40,
    0.03,
    10,
    false,
  );
  const leaf = baseAligned(puffy(leafShape(), 0.01, 0.035, 0.022));
  const heart = puffy(heartShape(), 0.25, 0.26);
  const star = puffy(starShape(), 0.18, 0.2, 0.14);
  const tear = baseAligned(puffy(teardropShape(), 0.02, 0.04, 0.028));
  const butterfly = puffy(butterflyShape(), 0.14, 0.16, 0.1);
  const bead = new THREE.SphereGeometry(1, 24, 16);
  const capsule = new THREE.CapsuleGeometry(0.03, 0.1, 6, 12);

  const blooms: Record<FlowerType, Part[]> = {
    hearts: [
      ...Array.from({ length: 5 }, (_, i): Part => {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        return {
          geo: heart,
          role: "petal",
          position: [Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0],
          // Heart tip points at the center.
          rotation: [0, 0, a - Math.PI / 2],
          scale: 0.1,
        };
      }),
      { geo: bead, role: "center", position: [0, 0, 0.03], rotation: [0, 0, 0], scale: 0.06 },
    ],
    star: [
      { geo: star, role: "petal", position: [0, 0.02, 0], rotation: [0, 0, 0], scale: 0.22 },
      { geo: bead, role: "center", position: [0, 0.02, 0.05], rotation: [0, 0, 0], scale: 0.04 },
    ],
    tulip: [
      { geo: tear, role: "petal", position: [0, -0.06, 0.03], rotation: [0.12, 0, 0], scale: 0.62 },
      { geo: tear, role: "petal", position: [-0.05, -0.05, -0.01], rotation: [0, 0, 0.42], scale: 0.58 },
      { geo: tear, role: "petal", position: [0.05, -0.05, -0.01], rotation: [0, 0, -0.42], scale: 0.58 },
    ],
    daisy: [
      ...Array.from({ length: 10 }, (_, i): Part => {
        const a = (i / 10) * Math.PI * 2;
        return {
          geo: capsule,
          role: "petal",
          position: [Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0],
          rotation: [0, 0, a - Math.PI / 2],
          scale: 1.3,
        };
      }),
      { geo: bead, role: "center", position: [0, 0, 0.02], rotation: [0, 0, 0], scale: 0.07 },
    ],
    flutter: [
      { geo: bead, role: "petal", position: [0, 0, 0], rotation: [0, 0, 0], scale: 0.075 },
      { geo: butterfly, role: "wing", position: [0.03, 0.13, 0.04], rotation: [0, 0, -0.2], scale: 0.11 },
    ],
  };

  return { stem, leaf, blooms };
}

let geometries: ReturnType<typeof build> | null = null;
export function flowerGeometries() {
  return (geometries ??= build());
}

// Pastel petals with a holographic rim; mint stems.
export const PETALS = ["#ffb3e2", "#d6c2ff", "#b3d4ff", "#ffcfe6", "#c4f1ff", "#ffd9c2"];

let materials: {
  stem: THREE.Material;
  center: THREE.Material;
  petals: THREE.Material[];
} | null = null;

export function flowerMaterials() {
  return (materials ??= {
    stem: createHolo({ color: "#b5f0d6", rim: 0.75, roughness: 0.12, envMapIntensity: 1.2 }),
    center: createHolo({ color: "#fff1b8", rim: 0.6, roughness: 0.1, envMapIntensity: 1.3 }),
    petals: PETALS.map((c) => createHolo({ color: c, rim: 0.9, roughness: 0.08, envMapIntensity: 1.5 })),
  });
}
