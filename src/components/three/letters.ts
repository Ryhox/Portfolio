import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// The hero lettering, "ryhox": flat, puffy chrome stickers like the charms (a flat face with a soft,
// rounded bevel), with liquid drips. Each glyph is a few tube strokes blended as 2D metaballs (joints melt
// together, ends round off, drips bead at the bottom), traced into a crisp outline and extruded.

type P = [number, number, number];
type Stroke = { pts: P[]; closed?: boolean };

// One stroke thickness everywhere (the bevel adds a little on top).
const T = 0.16;

// A drip running down from (x, y): it melts out of the letter, tapers, and gathers into a bead.
const drip = (x: number, y: number, len: number): Stroke => ({
  pts: [[x, y + 0.08, 0.14], [x, y - len * 0.3, 0.1], [x, y - len * 0.72, 0.085], [x, y - len, 0.115]],
});

function ellipse(cx: number, cy: number, rx: number, ry: number, r: number, n = 16): Stroke {
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r]);
  }
  return { pts, closed: true };
}

// x-height = 1, baseline = 0.
const GLYPHS: Record<string, Stroke[]> = {
  r: [
    { pts: [[0, 0, T], [0, 0.5, T], [0, 1, T]] },
    { pts: [[0, 0.6, T * 0.9], [0.13, 0.9, T], [0.36, 1.01, T], [0.56, 0.93, T]] },
    drip(0, 0, 0.42),
  ],
  y: [
    { pts: [[-0.34, 1, T], [-0.17, 0.62, T], [0.01, 0.26, T]] },
    { pts: [[0.36, 1, T], [0.2, 0.5, T], [0.01, 0.02, T], [-0.15, -0.38, T], [-0.36, -0.56, T]] },
  ],
  h: [
    { pts: [[0, 1.6, T], [0, 0.8, T], [0, 0, T]] },
    { pts: [[0, 0.62, T * 0.9], [0.15, 0.93, T], [0.42, 0.98, T], [0.58, 0.7, T], [0.58, 0.35, T], [0.58, 0, T]] },
    drip(0, 0, 0.28),
    drip(0.58, 0, 0.64),
  ],
  o: [ellipse(0.34, 0.5, 0.35, 0.44, T), drip(0.4, 0.08, 0.5)],
  x: [
    { pts: [[0, 1, T], [0.31, 0.5, T], [0.62, 0, T]] },
    { pts: [[0.62, 1, T], [0.31, 0.5, T], [0, 0, T]] },
    drip(0.62, 0, 0.54),
  ],
};

// Resample a stroke along a smooth curve, easing the radius between its points.
function densify({ pts, closed }: Stroke): P[] {
  if (pts.length === 1) return pts;
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    !!closed,
    "centripetal",
  );
  const n = Math.max(8, Math.ceil(curve.getLength() / 0.03));
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = curve.getPoint(u);
    const f = u * (closed ? pts.length : pts.length - 1);
    const i0 = Math.floor(f) % pts.length;
    const i1 = (i0 + 1) % pts.length;
    const r = THREE.MathUtils.lerp(pts[i0][2], pts[Math.min(i1, closed ? i1 : pts.length - 1)][2], THREE.MathUtils.smootherstep(f - Math.floor(f), 0, 1));
    out.push([p.x, p.y, r]);
  }
  return out;
}

const ISO = 0.42;
const STEP = 0.01;

// The blended field at (x, y): each stroke is a continuous tube (max over its segments), strokes add up
// so they bulge a little where they meet.
function fieldAt(strokes: P[][], x: number, y: number) {
  let sum = 0;
  for (const s of strokes) {
    let m = 0;
    const n = s.length === 1 ? 1 : s.length - 1;
    for (let i = 0; i < n; i++) {
      const a = s[i];
      const b = s.length === 1 ? a : s[i + 1];
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const len2 = abx * abx + aby * aby;
      let t = len2 > 0 ? ((x - a[0]) * abx + (y - a[1]) * aby) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = x - (a[0] + abx * t);
      const qy = y - (a[1] + aby * t);
      const r = a[2] + (b[2] - a[2]) * t;
      const d2 = (qx * qx + qy * qy) / (4 * r * r);
      if (d2 < 1) {
        const k = 1 - d2;
        m = Math.max(m, k * k * k);
      }
    }
    sum += m;
  }
  return sum;
}

// Marching squares over the field: closed outline loops (outer edges and holes).
function trace(strokes: P[][]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes)
    for (const [x, y, r] of s) {
      x0 = Math.min(x0, x - r * 2);
      y0 = Math.min(y0, y - r * 2);
      x1 = Math.max(x1, x + r * 2);
      y1 = Math.max(y1, y + r * 2);
    }
  const nx = Math.ceil((x1 - x0) / STEP) + 1;
  const ny = Math.ceil((y1 - y0) / STEP) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = i === 0 || j === 0 || i === nx - 1 || j === ny - 1 ? 0 : fieldAt(strokes, x0 + i * STEP, y0 + j * STEP);

  // Crossing point on an edge (ids: horizontal edges first, then vertical ones).
  const point = new Map<number, THREE.Vector2>();
  const cross = (ia: number, ja: number, ib: number, jb: number) => {
    const id = ja === jb ? ja * nx + ia : nx * ny + ia * ny + ja;
    if (!point.has(id)) {
      const va = v[ja * nx + ia];
      const vb = v[jb * nx + ib];
      const t = (ISO - va) / (vb - va);
      point.set(id, new THREE.Vector2(x0 + (ia + (ib - ia) * t) * STEP, y0 + (ja + (jb - ja) * t) * STEP));
    }
    return id;
  };
  const next = new Map<number, number>();
  const link = (a: number, b: number) => next.set(a, b);
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const bl = v[j * nx + i] > ISO ? 1 : 0;
      const br = v[j * nx + i + 1] > ISO ? 1 : 0;
      const tr = v[(j + 1) * nx + i + 1] > ISO ? 1 : 0;
      const tl = v[(j + 1) * nx + i] > ISO ? 1 : 0;
      const c = bl | (br << 1) | (tr << 2) | (tl << 3);
      if (c === 0 || c === 15) continue;
      const B = () => cross(i, j, i + 1, j);
      const R = () => cross(i + 1, j, i + 1, j + 1);
      const Tp = () => cross(i, j + 1, i + 1, j + 1);
      const L = () => cross(i, j, i, j + 1);
      // Segments run with the inside on the left (counter-clockwise outer loops).
      switch (c) {
        case 1: link(L(), B()); break;
        case 2: link(B(), R()); break;
        case 3: link(L(), R()); break;
        case 4: link(R(), Tp()); break;
        case 5: {
          const mid = (v[j * nx + i] + v[j * nx + i + 1] + v[(j + 1) * nx + i + 1] + v[(j + 1) * nx + i]) / 4;
          if (mid > ISO) {
            link(L(), Tp());
            link(R(), B());
          } else {
            link(L(), B());
            link(R(), Tp());
          }
          break;
        }
        case 6: link(B(), Tp()); break;
        case 7: link(L(), Tp()); break;
        case 8: link(Tp(), L()); break;
        case 9: link(Tp(), B()); break;
        case 10: {
          const mid = (v[j * nx + i] + v[j * nx + i + 1] + v[(j + 1) * nx + i + 1] + v[(j + 1) * nx + i]) / 4;
          if (mid > ISO) {
            link(B(), L());
            link(Tp(), R());
          } else {
            link(B(), R());
            link(Tp(), L());
          }
          break;
        }
        case 11: link(Tp(), R()); break;
        case 12: link(R(), L()); break;
        case 13: link(R(), B()); break;
        case 14: link(B(), L()); break;
      }
    }

  const loops: THREE.Vector2[][] = [];
  const seen = new Set<number>();
  for (const startId of next.keys()) {
    if (seen.has(startId)) continue;
    const loop: THREE.Vector2[] = [];
    let id: number | undefined = startId;
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      const p = point.get(id)!;
      // Keep points at least ~2 cells apart: smooth, but not needlessly dense.
      if (!loop.length || loop[loop.length - 1].distanceTo(p) > STEP * 1.8) loop.push(p);
      id = next.get(id);
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

function inside(p: THREE.Vector2, poly: THREE.Vector2[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const DEPTH = 0.1;
const BEVEL = 0.11;

// One glyph as a puffy sticker: baseline at y = 0, centred on x and on its depth.
export function buildGlyph(char: string) {
  const strokes = (GLYPHS[char] ?? []).map(densify);
  const loops = trace(strokes);
  const holes = loops.map((l) => loops.some((o) => o !== l && inside(l[0], o)));
  const shapes = loops
    .filter((_, i) => !holes[i])
    .map((outer) => {
      const shape = new THREE.Shape(outer);
      loops.forEach((l, i) => {
        if (holes[i] && inside(l[0], outer)) shape.holes.push(new THREE.Path(l));
      });
      return shape;
    });
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, curveSegments: 1, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL * 0.6, bevelSegments: 10 });
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  const merged = mergeVertices(geo, 1e-5);
  geo.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  merged.translate(-(bb.min.x + bb.max.x) / 2, 0, -DEPTH / 2);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
