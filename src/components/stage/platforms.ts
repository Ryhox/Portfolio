import { gsap } from "gsap";
import { stage } from "@/lib/stage";

// The page as a level: every surface the cat can stand on, measured live from the DOM (screen px).

export type Kind = "perch" | "vertical" | "track" | "treadmill" | "floor";

export type Platform = {
  id: string;
  kind: Kind;
  x0: number;
  x1: number;
  // Surface height at x: y + slope * (x - cx).
  y: number;
  cx: number;
  slope: number;
  angle: number;
  // Horizontal surface velocity (px/s): the treadmill and the moving gallery.
  u: number;
  valid: boolean;
  score: number;
};

// This frame's platforms, measured once by the stage rig and read by every actor.
export const live = { list: [] as Platform[] };

export function surfaceY(p: Platform, x: number) {
  return p.y + p.slope * (x - p.cx);
}

type Els = {
  statement: HTMLElement | null;
  statementCap: number;
  lineX0: number;
  lineX1: number;
  lineWords: HTMLElement[];
  note: HTMLElement | null;
  noteCap: number;
  marquee: HTMLElement | null;
  row: HTMLElement | null;
  rowLocalY: number;
  work: HTMLElement | null;
  headingWord: HTMLElement | null;
  headingCap: number;
  headingMasks: HTMLElement[];
  panels: HTMLElement[];
  sayWord: HTMLElement | null;
  sayCap: number;
  sayMasks: HTMLElement[];
  contact: HTMLElement | null;
};

let els: Els | null = null;
const measureCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

// Distance from the top of an element's (first) line box to the top of its capital letters.
// A hidden probe gives the real content-area position within the line box; canvas metrics give the
// cap height as a fraction of that content area.
function capOffset(el: HTMLElement) {
  const probe = document.createElement("span");
  probe.textContent = "H";
  probe.style.cssText = "position:absolute;left:-9999px;top:0;display:inline-block;white-space:nowrap;visibility:hidden;text-transform:none;";
  el.appendChild(probe);
  const box = probe.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(probe);
  const text = range.getBoundingClientRect();
  const cs = getComputedStyle(probe);
  el.removeChild(probe);

  const size = parseFloat(cs.fontSize);
  const ctx = measureCanvas?.getContext("2d");
  let capRatio = 0.2;
  if (ctx) {
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const m = ctx.measureText("H");
    const asc = m.fontBoundingBoxAscent || size * 0.9;
    const desc = m.fontBoundingBoxDescent || size * 0.25;
    capRatio = (asc - (m.actualBoundingBoxAscent || size * 0.7)) / (asc + desc);
  }
  return text.top - box.top + text.height * capRatio;
}

export function bindPlatforms() {
  const q = <T extends HTMLElement>(s: string) => document.querySelector<T>(s);
  const statement = q(".statement");
  const words = Array.from(document.querySelectorAll<HTMLElement>(".statement .w"));
  const firstTop = words[0]?.offsetTop ?? 0;
  const lineWords = words.filter((w) => Math.abs(w.offsetTop - firstTop) < 4);
  const first = lineWords[0];
  const last = lineWords[lineWords.length - 1];
  const marquee = q(".marquee");
  const row = q(".marquee-row");
  const headingWord = q(".work-heading .word");
  const sayWord = q(".sayhi .word");

  els = {
    statement,
    statementCap: statement ? capOffset(statement) : 0,
    lineX0: first && statement ? first.offsetLeft - statement.offsetLeft : 0,
    lineX1: last && statement ? last.offsetLeft + last.offsetWidth - statement.offsetLeft : 0,
    lineWords,
    note: q(".intro-note"),
    noteCap: q(".intro-note") ? capOffset(q(".intro-note")!) : 0,
    marquee,
    row,
    // The marquee is transformed, which makes it the rows' offsetParent.
    rowLocalY:
      marquee && row
        ? (row.offsetParent === marquee ? row.offsetTop : row.offsetTop - marquee.offsetTop) + capOffset(row) - marquee.offsetHeight / 2
        : 0,
    work: q(".work"),
    headingWord,
    headingCap: headingWord ? capOffset(headingWord) : 0,
    headingMasks: headingWord ? Array.from(headingWord.querySelectorAll<HTMLElement>(".char-mask")) : [],
    panels: Array.from(document.querySelectorAll<HTMLElement>(".panel-media, .more-icon")),
    sayWord,
    sayCap: sayWord ? capOffset(sayWord) : 0,
    sayMasks: sayWord ? Array.from(sayWord.querySelectorAll<HTMLElement>(".char-mask")) : [],
    contact: q(".contact"),
  };
}

// Paws sink a few px into letters so the cat reads as standing on them, not hovering.
const SINK = 5;

const CLIP = /inset\(\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%/;
const prevX: Record<string, number> = {};
const velX: Record<string, number> = {};

function make(id: string, kind: Kind, x0: number, x1: number, y: number): Platform {
  return { id, kind, x0, x1, y, cx: (x0 + x1) / 2, slope: 0, angle: 0, u: 0, valid: true, score: 0 };
}

// Surface velocity from frame-to-frame motion (smoothed), for platforms that slide sideways.
function track(p: Platform, dt: number) {
  const last = prevX[p.id];
  prevX[p.id] = p.x0;
  if (last === undefined || dt <= 0) return;
  const v = (p.x0 - last) / dt;
  velX[p.id] = (velX[p.id] ?? 0) + (v - (velX[p.id] ?? 0)) * Math.min(1, dt * 14);
  p.u = Math.abs(velX[p.id]) < 2 ? 0 : velX[p.id];
}

export function measurePlatforms(vw: number, vh: number, catLen: number, dt: number): Platform[] {
  if (!els) bindPlatforms();
  const e = els!;
  const out: Platform[] = [];
  const band = (y: number) => {
    const f = y / vh;
    if (f < 0.1 || f > 0.97) return 0;
    return Math.min(1, (f - 0.1) / 0.15, (0.97 - f) / 0.17);
  };
  const wideEnough = (p: Platform) => p.x1 - p.x0 > catLen * 0.7 && p.x1 > 30 && p.x0 < vw - 30;
  const prefX = vw * 0.42;
  const coverage = (p: Platform) => {
    const m = catLen * 0.45;
    if (prefX >= p.x0 + m && prefX <= p.x1 - m) return 1;
    const d = Math.min(Math.abs(prefX - (p.x0 + m)), Math.abs(prefX - (p.x1 - m)));
    return Math.max(0, 1 - d / (vw * 0.35));
  };

  // Hero "o".
  const perch = make("perch", "perch", stage.perch.x - 26, stage.perch.x + 26, stage.perch.y);
  perch.valid = stage.perch.valid;
  perch.score = 10;
  out.push(perch);

  // Statement: first line of the big text.
  if (e.statement) {
    const r = e.statement.getBoundingClientRect();
    const p = make("statement", "vertical", r.left + e.lineX0, r.left + e.lineX1, r.top + e.statementCap + SINK);
    p.valid = band(p.y) > 0 && wideEnough(p);
    p.score = band(p.y) * 1.5;
    out.push(p);
  }

  if (e.note) {
    const r = e.note.getBoundingClientRect();
    const p = make("note", "vertical", r.left, r.right, r.top + e.noteCap);
    p.valid = band(p.y) > 0 && wideEnough(p);
    p.score = band(p.y) * 1.45;
    out.push(p);
  }

  // Marquee: tilted, sliding treadmill.
  if (e.marquee && e.row) {
    const r = e.marquee.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const theta = ((gsap.getProperty(e.marquee, "rotation") as number) * Math.PI) / 180;
    const s = (gsap.getProperty(e.marquee, "scale") as number) || 1;
    const p = make("marquee", "treadmill", -vw, vw * 2, cy + (s * e.rowLocalY) / Math.cos(theta) + SINK);
    p.cx = cx;
    p.slope = Math.tan(theta);
    p.angle = theta;
    p.u = stage.marqueeVel * s;
    const mid = surfaceY(p, vw / 2);
    p.valid = band(mid) > 0;
    p.score = band(mid) * 1.6;
    out.push(p);
  }

  // Work: vertical on the way in, a sideways track while pinned.
  const pinned =
    vw >= 900 && !!e.work && (() => {
      const r = e.work!.getBoundingClientRect();
      return r.top <= 1 && r.bottom >= vh - 1;
    })();

  const addWorkPlatform = (p: Platform) => {
    track(p, dt);
    if (pinned) {
      p.kind = "track";
      p.valid = wideEnough(p) && p.x1 > vw * 0.05 && p.x0 < vw * 0.95 && band(p.y) > 0;
      p.score = p.valid ? 3 + coverage(p) : 0;
    } else {
      p.valid = band(p.y) > 0 && wideEnough(p);
      p.score = band(p.y) * 1.5;
    }
    out.push(p);
  };

  if (e.headingWord) {
    const r = e.headingWord.getBoundingClientRect();
    addWorkPlatform(make("heading", "vertical", r.left, r.right, r.top + e.headingCap + SINK));
  }

  e.panels.forEach((media, i) => {
    const r = media.getBoundingClientRect();
    // Only stand on the part of the image that has been revealed by the clip-path wipe.
    const m = CLIP.exec(media.style.clipPath);
    const top = m ? r.top + (r.height * parseFloat(m[1])) / 100 : r.top;
    const x0 = m ? r.left + (r.width * parseFloat(m[4])) / 100 : r.left;
    const x1 = m ? r.right - (r.width * parseFloat(m[2])) / 100 : r.right;
    addWorkPlatform(make(`panel-${i}`, "vertical", x0, x1, top));
  });

  if (e.sayWord) {
    const r = e.sayWord.getBoundingClientRect();
    const p = make("sayhi", "vertical", r.left, r.right, r.top + e.sayCap + SINK);
    p.valid = band(p.y) > 0 && wideEnough(p);
    p.score = band(p.y) * 1.4;
    out.push(p);
  }

  // The garden floor at the very bottom.
  if (e.contact) {
    const r = e.contact.getBoundingClientRect();
    // Just above the footer line, well below the links.
    // (On phones the footer stacks into three lines, so the floor sits higher.)
    const p = make("floor", "floor", 0, vw, r.bottom - (vw < 900 ? 108 : 50));
    p.valid = p.y > vh * 0.45 && p.y < vh + 4;
    p.score = p.valid ? 5 : 0;
    stage.floorY = p.y;
    stage.playground = p.valid;
    out.push(p);
  }

  return out;
}

// Elements that visibly give way when the cat lands on (or stomps) a platform.
function dipTargets(id: string): HTMLElement[] {
  if (!els) return [];
  if (id === "statement") return els.lineWords;
  if (id === "note" && els.note) return [els.note];
  if (id === "heading") return els.headingMasks;
  if (id === "sayhi") return els.sayMasks;
  if (id.startsWith("panel-")) {
    const el = els.panels[Number(id.slice(6))];
    return el ? [el] : [];
  }
  return [];
}

export function dip(id: string, x: number, range: number, strength: number) {
  for (const el of dipTargets(id)) {
    const r = el.getBoundingClientRect();
    const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    if (d > range) continue;
    const amount = strength * Math.pow(1 - d / range, 1.4);
    gsap.killTweensOf(el, "--dip");
    gsap
      .timeline()
      .to(el, { "--dip": `${amount}px`, duration: 0.07, ease: "power2.out" })
      .to(el, { "--dip": "0px", duration: 1.1, ease: "elastic.out(1, 0.28)" });
  }
}
