import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

// Liquid Y2K lettering: each glyph is a set of tube strokes (x, y, radius) that are blended as
// metaballs, so joints melt together, terminals swell into droplets and drips hang off the bottom.

type P = [number, number, number];
type Stroke = { pts: P[]; closed?: boolean };

const ball = (x: number, y: number, r: number): Stroke => ({ pts: [[x, y, r]] });

function ellipse(cx: number, cy: number, rx: number, ry: number, r: number, n = 12): Stroke {
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Slightly heavier at the bottom, like liquid settling.
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r * (1 - Math.sin(a) * 0.1)]);
  }
  return { pts, closed: true };
}

// x-height = 1, baseline = 0.
const GLYPHS: Record<string, Stroke[]> = {
  r: [
    { pts: [[0, -0.02, 0.21], [0, 0.5, 0.19], [0.01, 1.0, 0.2]] },
    { pts: [[0.02, 0.6, 0.17], [0.14, 0.9, 0.17], [0.38, 1.02, 0.18], [0.56, 0.9, 0.19]] },
    ball(0, -0.1, 0.25),
    ball(0.6, 0.86, 0.22),
  ],
  y: [
    { pts: [[-0.36, 1.0, 0.2], [-0.2, 0.6, 0.17], [0.02, 0.22, 0.18]] },
    { pts: [[0.38, 1.0, 0.2], [0.22, 0.45, 0.18], [0.02, 0.0, 0.18], [-0.14, -0.42, 0.18], [-0.36, -0.6, 0.19]] },
    ball(-0.36, 1.04, 0.24),
    ball(0.38, 1.04, 0.23),
    ball(-0.44, -0.6, 0.25),
  ],
  h: [
    { pts: [[0, 1.58, 0.2], [0, 0.8, 0.19], [0, -0.02, 0.21]] },
    { pts: [[0.02, 0.6, 0.17], [0.17, 0.94, 0.18], [0.44, 0.96, 0.19], [0.57, 0.62, 0.19], [0.58, 0.08, 0.2]] },
    ball(0, 1.62, 0.23),
    ball(0, -0.1, 0.25),
    ball(0.59, -0.06, 0.23),
    { pts: [[0.6, -0.05, 0.12], [0.62, -0.32, 0.09]] },
    ball(0.62, -0.38, 0.13),
  ],
  o: [ellipse(0.34, 0.5, 0.36, 0.42, 0.2)],
  x: [
    { pts: [[0, 1.0, 0.2], [0.3, 0.5, 0.17], [0.62, -0.02, 0.21]] },
    { pts: [[0.62, 1.0, 0.2], [0.3, 0.5, 0.17], [0, -0.02, 0.21]] },
    ball(-0.03, 1.04, 0.23),
    ball(0.65, 1.04, 0.23),
    ball(-0.03, -0.08, 0.24),
    ball(0.66, -0.08, 0.25),
    { pts: [[0.67, -0.1, 0.12], [0.69, -0.42, 0.09]] },
    ball(0.69, -0.48, 0.14),
  ],
};

// Resample a stroke through a smooth curve, interpolating radius.
function densify(stroke: Stroke): P[] {
  const { pts, closed } = stroke;
  if (pts.length === 1) return pts;
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    !!closed,
    "centripetal",
  );
  const n = Math.max(8, Math.ceil(curve.getLength() / 0.04));
  const out: P[] = [];
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const u = i / n;
    const p = curve.getPoint(u);
    const f = u * (closed ? pts.length : pts.length - 1);
    const i0 = Math.floor(f) % pts.length;
    const i1 = Math.min(i0 + 1, pts.length - 1 + (closed ? 1 : 0)) % pts.length;
    const r = THREE.MathUtils.lerp(pts[i0][2], pts[i1][2], THREE.MathUtils.smootherstep(f - Math.floor(f), 0, 1));
    out.push([p.x, p.y, r]);
  }
  if (closed) out.push(out[0]);
  return out;
}

const RES = 84;
const ISO = 0.42;

// Builds one glyph's geometry. Returned geometry has its baseline at y = 0 and is centered on x.
export function buildLiquidGlyph(char: string) {
  const strokes = (GLYPHS[char] ?? []).map(densify);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxR = 0;
  for (const s of strokes)
    for (const [x, y, r] of s) {
      minX = Math.min(minX, x - r);
      maxX = Math.max(maxX, x + r);
      minY = Math.min(minY, y - r);
      maxY = Math.max(maxY, y + r);
      maxR = Math.max(maxR, r);
    }
  const pad = maxR * 1.2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY, maxR * 4) / 2 + pad;

  const mc = new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, 120000);
  mc.isolation = ISO;
  const field = mc.field as Float32Array;
  field.fill(0);
  const strokeBuf = new Float32Array(field.length);
  const cell = (2 * half) / RES;
  const toIdx = (v: number, c: number) => (v - c) / half * (RES / 2) + RES / 2;

  for (const s of strokes) {
    strokeBuf.fill(0);
    let bx0 = RES, by0 = RES, bz0 = RES, bx1 = 0, by1 = 0, bz1 = 0;
    // Each stroke is a continuous tube: take the max over its segments, then sum strokes so
    // separate strokes bulge where they meet.
    const segs = s.length === 1 ? [[s[0], s[0]]] : s.slice(1).map((p, i) => [s[i], p]);
    for (const [a, b] of segs) {
      const R = Math.max(a[2], b[2]) * 2;
      const x0 = Math.max(1, Math.floor(toIdx(Math.min(a[0], b[0]) - R, cx)));
      const x1 = Math.min(RES - 2, Math.ceil(toIdx(Math.max(a[0], b[0]) + R, cx)));
      const y0 = Math.max(1, Math.floor(toIdx(Math.min(a[1], b[1]) - R, cy)));
      const y1 = Math.min(RES - 2, Math.ceil(toIdx(Math.max(a[1], b[1]) + R, cy)));
      const z0 = Math.max(1, Math.floor(toIdx(-R, 0)));
      const z1 = Math.min(RES - 2, Math.ceil(toIdx(R, 0)));
      bx0 = Math.min(bx0, x0); bx1 = Math.max(bx1, x1);
      by0 = Math.min(by0, y0); by1 = Math.max(by1, y1);
      bz0 = Math.min(bz0, z0); bz1 = Math.max(bz1, z1);
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const len2 = abx * abx + aby * aby;
      for (let z = z0; z <= z1; z++) {
        const pz = (z - RES / 2) * cell;
        for (let y = y0; y <= y1; y++) {
          const py = (y - RES / 2) * cell + cy;
          for (let x = x0; x <= x1; x++) {
            const px = (x - RES / 2) * cell + cx;
            let t = len2 > 0 ? ((px - a[0]) * abx + (py - a[1]) * aby) / len2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = px - (a[0] + abx * t);
            const qy = py - (a[1] + aby * t);
            const r = a[2] + (b[2] - a[2]) * t;
            const d2 = (qx * qx + qy * qy + pz * pz) / (4 * r * r);
            if (d2 >= 1) continue;
            const k = 1 - d2;
            const v = k * k * k;
            const i = z * RES * RES + y * RES + x;
            if (v > strokeBuf[i]) strokeBuf[i] = v;
          }
        }
      }
    }
    for (let z = bz0; z <= bz1; z++)
      for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
          const i = z * RES * RES + y * RES + x;
          field[i] += strokeBuf[i];
        }
  }

  mc.update();
  const count = mc.count;
  const src = mc.geometry;
  const geo = new THREE.BufferGeometry();
  const pos = (src.getAttribute("position").array as Float32Array).slice(0, count * 3);
  const nor = (src.getAttribute("normal").array as Float32Array).slice(0, count * 3);
  // Marching cubes works in [-1, 1]; map back to glyph units.
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = pos[i] * half;
    pos[i + 1] = pos[i + 1] * half + cy;
    pos[i + 2] = pos[i + 2] * half;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  mc.geometry.dispose();
  return geo;
}
