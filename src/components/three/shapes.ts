import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Y2K charm silhouettes, all roughly within a unit radius.

export function sparkleShape() {
  const s = new THREE.Shape();
  const p = 0.16;
  s.moveTo(0, 1);
  s.quadraticCurveTo(p, p, 1, 0);
  s.quadraticCurveTo(p, -p, 0, -1);
  s.quadraticCurveTo(-p, -p, -1, 0);
  s.quadraticCurveTo(-p, p, 0, 1);
  return s;
}

export function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-0.35, -0.55, -1.05, -0.2, -1.05, 0.3);
  s.bezierCurveTo(-1.05, 0.78, -0.62, 1.02, -0.3, 0.98);
  s.bezierCurveTo(-0.12, 0.96, 0, 0.82, 0, 0.66);
  s.bezierCurveTo(0, 0.82, 0.12, 0.96, 0.3, 0.98);
  s.bezierCurveTo(0.62, 1.02, 1.05, 0.78, 1.05, 0.3);
  s.bezierCurveTo(1.05, -0.2, 0.35, -0.55, 0, -0.9);
  return s;
}

export function starShape() {
  const s = new THREE.Shape();
  const pts = 5;
  for (let i = 0; i <= pts * 2; i++) {
    const a = Math.PI / 2 + (i / (pts * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

export function moonShape() {
  // Crescent: outer circle minus an offset circle.
  const d = 0.42;
  const r2 = 0.82;
  const x = (d * d + 1 - r2 * r2) / (2 * d);
  const y = Math.sqrt(1 - x * x);
  const a = Math.atan2(y, x);
  const b = Math.atan2(y, x - d);
  const s = new THREE.Shape();
  s.absarc(0, 0, 1, a, Math.PI * 2 - a, false);
  s.absarc(d, 0, r2, -b, -Math.PI * 2 + b, true);
  return s;
}

export function butterflyShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.05);
  s.bezierCurveTo(0.25, 0.55, 0.95, 0.95, 1.0, 0.45);
  s.bezierCurveTo(1.05, 0.05, 0.55, -0.05, 0.2, -0.08);
  s.bezierCurveTo(0.6, -0.2, 0.8, -0.75, 0.45, -0.85);
  s.bezierCurveTo(0.2, -0.92, 0.05, -0.5, 0, -0.3);
  s.bezierCurveTo(-0.05, -0.5, -0.2, -0.92, -0.45, -0.85);
  s.bezierCurveTo(-0.8, -0.75, -0.6, -0.2, -0.2, -0.08);
  s.bezierCurveTo(-0.55, -0.05, -1.05, 0.05, -1.0, 0.45);
  s.bezierCurveTo(-0.95, 0.95, -0.25, 0.55, 0, 0.05);
  return s;
}

// Extrudes a shape with a deep, rounded bevel and smooth normals so it reads as an inflated blob.
export function puffy(shape: THREE.Shape, depth: number, bevel: number, bevelSize = bevel * 0.8) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 40,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize,
    bevelSegments: 12,
  });
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  const merged = mergeVertices(geo, 1e-4);
  merged.computeVertexNormals();
  merged.center();
  geo.dispose();
  return merged;
}
