// Terrain for the cat: the real top edges of things on the page (letters included), as height profiles.
//
// A Surface is a strip of profile samples in its own local frame (px, y down), placed on screen by a
// 2D affine matrix that is refreshed every frame. The cat stores its position in that local frame, so a
// surface that slides, scrolls, rotates or skews carries it exactly. Letter tops come from rendering
// each glyph to a canvas in the page's own font and scanning for the first inked pixel per column.

export const STEP = 2;

export type Kind = "perch" | "text" | "treadmill" | "track" | "block" | "floor";

// screen = [a c e; b d f] · (lx, ly, 1)
export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };

export type Surface = {
  id: string;
  kind: Kind;
  // Sample i sits at local x = lx0 + i * STEP. `base` is the measured profile, `h` this frame's
  // (base + dips, minus parts that are hidden or still animating in). NaN = nothing there.
  lx0: number;
  base: Float32Array;
  h: Float32Array;
  // What paws actually rest on: `h` with every valley narrower than the cat's stride bridged
  // (a morphological closing) and small empty gaps between letters stepped over.
  walk: Float32Array;
  // Scratch for the closing.
  tmp: Float32Array;
  // > 0: the profile repeats every `period` local px (the marquee).
  period: number;
  m: Affine;
  // Screen velocity of the local frame (px/s).
  vx: number;
  vy: number;
  valid: boolean;
  score: number;
  // Where on screen the cat likes to be on this surface (companion surfaces), NaN = anywhere.
  prefX: number;
  // Glyph / block spans, for dips and per-part masking.
  parts: Part[];
};

export type Part = {
  i0: number;
  i1: number;
  // This part's own top edge, sample i0 + k = ys[k] (NaN = none). Parts can overlap (a title above
  // an icon): the surface is recomposed from whichever parts are there this frame.
  ys: Float32Array;
  el: HTMLElement | null;
  // Rest-state check for things that animate in (letters rising, images wiping open).
  solid?: () => boolean;
  // Partly revealed things: hide everything left of `left` (0..1 of the part), lower the top by `drop` px.
  mask?: () => { left: number; drop: number } | null;
  dip: { v: number };
};

export const makeAffine = (): Affine => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export function setTranslate(m: Affine, x: number, y: number) {
  m.a = 1;
  m.b = 0;
  m.c = 0;
  m.d = 1;
  m.e = x;
  m.f = y;
}

export function toScreen(s: Surface, lx: number, ly: number, out: { x: number; y: number }) {
  const m = s.m;
  out.x = m.a * lx + m.c * ly + m.e;
  out.y = m.b * lx + m.d * ly + m.f;
  return out;
}

export function toLocal(s: Surface, x: number, y: number, out: { x: number; y: number }) {
  const m = s.m;
  const det = m.a * m.d - m.b * m.c || 1;
  const dx = x - m.e;
  const dy = y - m.f;
  out.x = (m.d * dx - m.c * dy) / det;
  out.y = (-m.b * dx + m.a * dy) / det;
  return out;
}

// Angle of the local x axis on screen (the cat leans with rotated surfaces).
export const surfaceAngle = (s: Surface) => Math.atan2(s.m.b, s.m.a);
// Screen px per local px along x.
export const surfaceScale = (s: Surface) => Math.hypot(s.m.a, s.m.b);

function index(s: Surface, lx: number) {
  let f = (lx - s.lx0) / STEP;
  const n = s.h.length;
  if (s.period > 0) f = ((f % n) + n) % n;
  return f;
}

function sampleAt(s: Surface, arr: Float32Array, lx: number) {
  const f = index(s, lx);
  const n = arr.length;
  const i = Math.floor(f);
  if (s.period <= 0 && (i < 0 || i >= n - 1)) return i === n - 1 && f === i ? arr[i] : NaN;
  const a = arr[i % n];
  const b = arr[(i + 1) % n];
  if (a !== a || b !== b) return NaN;
  return a + (b - a) * (f - i);
}

// Height of the top surface at local x (local y, down), NaN where there is nothing.
export const heightAt = (s: Surface, lx: number) => sampleAt(s, s.h, lx);
// Height of the walk line (where a paw would rest) at local x.
export const walkAt = (s: Surface, lx: number) => sampleAt(s, s.walk, lx);

// Highest point (smallest y) in [x0, x1], NaN if there is nothing solid at all.
export function peakIn(s: Surface, x0: number, x1: number) {
  let best = NaN;
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += STEP) {
    const f = index(s, x);
    const i = Math.round(f);
    const v = s.period > 0 ? s.h[((i % s.h.length) + s.h.length) % s.h.length] : s.h[i];
    if (v === v && v !== undefined && !(v >= best)) best = v;
  }
  return best;
}

// Slope-limited: a spot you can put a paw on (not the side of a letter, not a sharp spike).
export function footing(s: Surface, lx: number, maxSlope = 1.1) {
  const y = heightAt(s, lx);
  if (y !== y) return NaN;
  const l = heightAt(s, lx - STEP * 2);
  const r = heightAt(s, lx + STEP * 2);
  if (l !== l || r !== r) return y;
  const slope = Math.max(Math.abs(y - l), Math.abs(r - y)) / (STEP * 2);
  return slope > maxSlope ? NaN : y;
}

// ---------- Glyph silhouettes ----------

type Glyph = { x0: number; top: Float32Array };
const glyphCache = new Map<string, Glyph>();
let scratch: HTMLCanvasElement | null = null;
const MAX_RASTER = 170;

function rasterTop(draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number, scale: number, originX: number, originY: number) {
  scratch ??= document.createElement("canvas");
  const cw = Math.max(4, Math.ceil(w * scale));
  const ch = Math.max(4, Math.ceil(h * scale));
  scratch.width = cw;
  scratch.height = ch;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(originX, originY);
  draw(ctx);
  ctx.restore();
  const data = ctx.getImageData(0, 0, cw, ch).data;
  // For each canvas column: first inked row.
  const cols = new Float32Array(cw).fill(NaN);
  for (let x = 0; x < cw; x++) {
    for (let y = 0; y < ch; y++) {
      if (data[(y * cw + x) * 4 + 3] > 110) {
        cols[x] = y / scale - originY;
        break;
      }
    }
  }
  // Resample to STEP-spaced columns in CSS px, starting at the first inked column.
  let first = -1;
  let last = -1;
  for (let x = 0; x < cw; x++)
    if (cols[x] === cols[x]) {
      if (first < 0) first = x;
      last = x;
    }
  if (first < 0) return { x0: 0, top: new Float32Array(0) };
  const x0 = first / scale - originX;
  const x1 = (last + 1) / scale - originX;
  const n = Math.max(1, Math.round((x1 - x0) / STEP));
  const top = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = Math.floor((x0 + i * STEP + originX) * scale);
    const b = Math.max(a + 1, Math.floor((x0 + (i + 1) * STEP + originX) * scale));
    let v = NaN;
    for (let x = a; x < b && x < cw; x++) if (cols[x] === cols[x] && !(cols[x] >= v)) v = cols[x];
    top[i] = v;
  }
  return { x0, top };
}

// Top edge of one glyph relative to its pen position (x) and baseline (y, negative = above).
export function glyphTop(ch: string, font: string, size: number): Glyph {
  const key = `${font}|${size.toFixed(2)}|${ch}`;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const scale = Math.min(1, MAX_RASTER / size);
  const w = size * 1.6;
  const h = size * 1.7;
  const g = rasterTop(
    (ctx) => {
      ctx.font = font;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#000";
      ctx.fillText(ch, 0, 0);
    },
    w,
    h,
    scale,
    size * 0.3,
    size * 1.25,
  );
  glyphCache.set(key, g);
  return g;
}

// Top edge of an SVG path drawn into a box (the marquee's sparkle separators).
export function pathTop(d: string, viewBox: number, size: number): Glyph {
  const key = `path|${d}|${size.toFixed(2)}`;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const path = new Path2D(d);
  const g = rasterTop(
    (ctx) => {
      ctx.scale(size / viewBox, size / viewBox);
      ctx.fill(path);
    },
    size + 4,
    size + 4,
    Math.min(1, MAX_RASTER / size),
    2,
    2,
  );
  glyphCache.set(key, g);
  return g;
}

let ruler: CanvasRenderingContext2D | null = null;
// Distance from the top of a text line box (a Range rect) down to the baseline.
export function ascentOf(font: string) {
  ruler ??= document.createElement("canvas").getContext("2d");
  if (!ruler) return 0;
  ruler.font = font;
  return ruler.measureText("H").fontBoundingBoxAscent;
}

export const fontOf = (cs: CSSStyleDeclaration) => `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;

// ---------- Building a surface ----------

// One dip value per DOM element, shared by every glyph drawn inside it.
const dips = new WeakMap<HTMLElement, { v: number }>();
const dipFor = (el: HTMLElement | null) => {
  if (!el) return { v: 0 };
  let d = dips.get(el);
  if (!d) dips.set(el, (d = { v: 0 }));
  return d;
};

export class ProfileBuilder {
  parts: Part[] = [];

  private add(i0: number, ys: Float32Array, el: HTMLElement | null, solid?: Part["solid"], mask?: Part["mask"]) {
    if (!ys.length) return;
    this.parts.push({ i0, i1: i0 + ys.length - 1, ys, el, solid, mask, dip: dipFor(el) });
  }

  // A glyph whose pen position / baseline are given in the surface's local frame.
  glyph(g: Glyph, penX: number, baseY: number, el: HTMLElement | null, solid?: () => boolean) {
    const ys = new Float32Array(g.top.length);
    for (let k = 0; k < ys.length; k++) ys[k] = baseY + g.top[k];
    this.add(Math.round((penX + g.x0) / STEP), ys, el, solid);
  }

  // A flat top from x0 to x1 at height y with rounded corners of radius r.
  block(x0: number, x1: number, y: number, r: number, el: HTMLElement | null, solid?: () => boolean, mask?: Part["mask"]) {
    const i0 = Math.ceil(x0 / STEP);
    const i1 = Math.floor(x1 / STEP);
    const ys = new Float32Array(Math.max(0, i1 - i0 + 1));
    for (let i = i0; i <= i1; i++) {
      const x = i * STEP;
      const e = Math.min(x - x0, x1 - x);
      ys[i - i0] = y + (e < r ? r - Math.sqrt(Math.max(0, r * r - (r - e) * (r - e))) : 0);
    }
    this.add(i0, ys, el, solid, mask);
  }

  // The top arc of a circle (the GitHub mark).
  disc(cx: number, cy: number, r: number, el: HTMLElement | null, solid?: () => boolean) {
    const i0 = Math.ceil((cx - r) / STEP);
    const i1 = Math.floor((cx + r) / STEP);
    const ys = new Float32Array(Math.max(0, i1 - i0 + 1));
    for (let i = i0; i <= i1; i++) {
      const dx = i * STEP - cx;
      ys[i - i0] = cy - Math.sqrt(Math.max(0, r * r - dx * dx));
    }
    this.add(i0, ys, el, solid);
  }

  build(id: string, kind: Kind, period = 0): Surface {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of this.parts) {
      lo = Math.min(lo, p.i0);
      hi = Math.max(hi, p.i1);
    }
    if (period > 0) {
      lo = 0;
      hi = Math.round(period / STEP) - 1;
    }
    if (!Number.isFinite(lo)) {
      lo = 0;
      hi = 1;
    }
    const n = hi - lo + 1;
    for (const p of this.parts) {
      p.i0 -= lo;
      p.i1 -= lo;
    }
    const surface: Surface = {
      id,
      kind,
      lx0: lo * STEP,
      base: new Float32Array(n).fill(NaN),
      h: new Float32Array(n).fill(NaN),
      walk: new Float32Array(n).fill(NaN),
      tmp: new Float32Array(n + 64),
      period,
      m: makeAffine(),
      vx: 0,
      vy: 0,
      valid: false,
      score: 0,
      prefX: NaN,
      parts: this.parts,
    };
    compose(surface, true);
    surface.base.set(surface.h);
    return surface;
  }
}

// The top edge from every part that's there right now (topmost wins), with dips and reveal masks.
function compose(s: Surface, all: boolean) {
  const h = s.h;
  const n = h.length;
  h.fill(NaN);
  for (const p of s.parts) {
    if (!all && p.solid && !p.solid()) continue;
    const cut = !all && p.mask ? p.mask() : null;
    const edge = cut ? p.i0 + Math.ceil((p.i1 - p.i0) * cut.left) : p.i0;
    const off = (all ? 0 : p.dip.v) + (cut ? cut.drop : 0);
    for (let i = Math.max(p.i0, edge); i <= p.i1; i++) {
      const v = p.ys[i - p.i0];
      if (v !== v) continue;
      const k = s.period > 0 ? ((i % n) + n) % n : i;
      if (k < 0 || k >= n) continue;
      const y = v + off;
      if (!(h[k] <= y)) h[k] = y;
    }
  }
}

// Per frame: recompose from the parts that are there (not still animating in), with dips.
export const refresh = (s: Surface) => compose(s, false);

const FAR = 1e7;
let bufA = new Float32Array(0);
let bufG = new Float32Array(0);
let bufH = new Float32Array(0);

// Sliding min (or max) over a window of 2r+1 samples, in place on buf[0..m). Samples closer than r to
// either end are left undefined (FAR): callers pad the array and only read the middle.
function slide(buf: Float32Array, m: number, r: number, isMin: boolean) {
  const k = 2 * r + 1;
  if (bufG.length < m) {
    bufG = new Float32Array(m);
    bufH = new Float32Array(m);
  }
  const g = bufG;
  const h = bufH;
  for (let i = 0; i < m; i++) {
    const v = buf[i];
    g[i] = i % k === 0 ? v : isMin ? Math.min(g[i - 1], v) : Math.max(g[i - 1], v);
  }
  for (let i = m - 1; i >= 0; i--) {
    const v = buf[i];
    h[i] = i === m - 1 || (i + 1) % k === 0 ? v : isMin ? Math.min(h[i + 1], v) : Math.max(h[i + 1], v);
  }
  for (let i = 0; i < m; i++) {
    if (i < r || i + r >= m) buf[i] = FAR;
    else buf[i] = isMin ? Math.min(h[i - r], g[i + r]) : Math.max(h[i - r], g[i + r]);
  }
}

// Walk line: close valleys narrower than `stride` px, bridge empty gaps narrower than `step` px.
export function computeWalk(s: Surface, stride: number, step: number) {
  const n = s.h.length;
  const r = Math.max(1, Math.round(stride / STEP / 2));
  const pad = 2 * r + 2;
  const periodic = s.period > 0;
  const m = n + 2 * pad;
  if (bufA.length < m) bufA = new Float32Array(m);
  const a = bufA;
  for (let i = 0; i < m; i++) {
    const j = i - pad;
    let v: number;
    if (j >= 0 && j < n) v = s.h[j];
    else v = periodic ? s.h[((j % n) + n) % n] : NaN;
    a[i] = v === v ? v : FAR;
  }
  // Dilate (highest point in reach), then erode: valleys narrower than the window fill in.
  slide(a, m, r, true);
  slide(a, m, r, false);
  const w = s.walk;
  const gapMax = Math.round(step / STEP);
  // Empty gaps wider than a paw step stay gaps (word spaces): copy the walk line, then re-open them.
  for (let i = 0; i < n; i++) {
    const v = a[i + pad];
    w[i] = v >= FAR * 0.5 ? NaN : Math.min(v, s.h[i] === s.h[i] ? s.h[i] : v);
  }
  let i = 0;
  while (i < n) {
    if (s.h[i] === s.h[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && s.h[j] !== s.h[j]) j++;
    const open = periodic || (i > 0 && j < n);
    if (j - i > gapMax || !open) for (let k = i; k < j; k++) w[k] = NaN;
    i = j;
  }
}

// Measure a batch of elements with every listed transform switched off (GSAP writes inline styles),
// so layout positions are the rest positions no matter what is animating right now.
export function withoutTransforms<T>(els: (Element | null | undefined)[], fn: () => T): T {
  const saved: [HTMLElement, string, string][] = [];
  for (const el of els) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;
    const h = el as HTMLElement;
    saved.push([h, h.style.transform, h.style.translate]);
    h.style.transform = "none";
    h.style.translate = "none";
  }
  try {
    return fn();
  } finally {
    for (const [h, t, tr] of saved) {
      h.style.transform = t;
      h.style.translate = tr;
    }
  }
}

// Pen positions + baselines of every character inside `root`, relative to the `origin` rect.
export function letters(root: HTMLElement, origin: DOMRect) {
  const out: { ch: string; x: number; base: number; font: string; size: number; el: HTMLElement }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    const parent = node.parentElement;
    if (!parent || !text.trim()) continue;
    // Skip hidden duplicates (e.g. screen-reader text, roll-over copies).
    if (parent.closest("[aria-hidden='true'] .sr-only, .sr-only")) continue;
    const cs = getComputedStyle(parent);
    const font = fontOf(cs);
    const size = parseFloat(cs.fontSize);
    const asc = ascentOf(font);
    const upper = cs.textTransform === "uppercase";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === " " || c === " " || c === "\n") continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      out.push({ ch: upper ? c.toUpperCase() : c, x: r.left - origin.left, base: r.top - origin.top + asc, font, size, el: parent });
    }
  }
  return out;
}
