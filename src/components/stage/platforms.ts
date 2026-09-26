import { gsap } from "gsap";
import { floorLift, stage } from "@/lib/stage";
import { catHeight } from "./view";
import {
  ProfileBuilder,
  STEP,
  computeWalk,
  glyphTop,
  heightAt,
  toLocal,
  toScreen,
  letters,
  refresh,
  setTranslate,
  withoutTransforms,
  type Part,
  type Surface,
} from "./terrain";

// The page as a level: every surface the cat can stand on, measured from the DOM. Letters contribute
// their real silhouettes; images their top edges; the marquee is an endless treadmill.

export type { Surface } from "./terrain";

// This frame's surfaces, measured once by the stage rig and read by every actor.
export const live = { list: [] as Surface[], epoch: 0 };

// Paws sink a couple of px into what they stand on, so contact reads as contact.
export const SINK = 2;

type Bound = {
  surface: Surface;
  // Refresh placement + validity for this frame.
  place: (s: Surface, vw: number, vh: number) => void;
};

let bound: Bound[] = [];

// A letter only counts as solid once it has finished animating in (and, on the About stage, only the
// ability that is showing).
const atRest = (el: HTMLElement) => () => {
  const ability = el.closest(".ability");
  if (ability && (!ability.classList.contains("is-on") || ((gsap.getProperty(el, "opacity") as number) ?? 1) < 0.9)) return false;
  const y = Math.abs((gsap.getProperty(el, "yPercent") as number) || 0) + Math.abs((gsap.getProperty(el, "y") as number) || 0);
  const r = Math.abs((gsap.getProperty(el, "rotation") as number) || 0);
  const s = (gsap.getProperty(el, "scale") as number) ?? 1;
  return y < 2 && r < 1.5 && Math.abs(1 - s) < 0.03;
};

const band = (y: number, vh: number) => {
  const f = y / vh;
  if (f < 0.1 || f > 0.97) return 0;
  return Math.min(1, (f - 0.1) / 0.15, (0.97 - f) / 0.17);
};

// Glyph silhouettes of every letter under `root`, in `origin`-relative px.
function addText(b: ProfileBuilder, root: HTMLElement, origin: DOMRect, opts: { dipEl?: (el: HTMLElement) => HTMLElement | null; animated?: boolean } = {}) {
  for (const l of letters(root, origin)) {
    const g = glyphTop(l.ch, l.font, l.size);
    const dipEl = opts.dipEl ? opts.dipEl(l.el) : null;
    b.glyph(g, l.x, l.base, dipEl, opts.animated ? atRest(l.el) : undefined);
  }
}

const charMask = (el: HTMLElement) => el.closest<HTMLElement>(".char-mask");

// How comfortably some part of the surface sits on screen (best band value over the visible width).
function visibleBand(s: Surface, vw: number, vh: number) {
  const p = { x: 0, y: 0 };
  let best = 0;
  for (let x = 20; x < vw - 20; x += 16) {
    toLocal(s, x, 0, p);
    const h = heightAt(s, p.x);
    if (h !== h) continue;
    toScreen(s, p.x, h, p);
    best = Math.max(best, band(p.y, vh));
  }
  return best;
}

function screenTop(s: Surface) {
  // Topmost defined profile point, in screen y (for band checks).
  let best = Infinity;
  for (let i = 0; i < s.h.length; i += 4) {
    const v = s.h[i];
    if (v === v && v < best) best = v;
  }
  return best === Infinity ? NaN : s.m.b * 0 + s.m.d * best + s.m.f;
}

// Screen velocity of the local origin (a looping treadmill jumps by one period: fold that out).
function velocity(s: Surface, ex: number, ey: number, dt: number) {
  if (dt <= 0 || !s.valid) return;
  let dx = s.m.e - ex;
  const dy = s.m.f - ey;
  if (s.period > 0) {
    const span = s.period * s.m.a;
    if (Math.abs(span) > 1) dx -= Math.round(dx / span) * span;
  }
  const k = Math.min(1, dt * 16);
  s.vx += (dx / dt - s.vx) * k;
  s.vy += (dy / dt - s.vy) * k;
}

export function bindPlatforms() {
  const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T & HTMLElement>(sel);
  const next: Bound[] = [];
  const vw = window.innerWidth;
  const desktop = vw >= 900;

  // --- Hero "o" (the 3D letter publishes its top point) ---
  {
    const b = new ProfileBuilder();
    b.disc(0, 64, 64, null);
    const s = b.build("perch", "perch");
    next.push({
      surface: s,
      place: (s) => {
        setTranslate(s.m, stage.perch.x, stage.perch.y);
        s.valid = stage.perch.valid;
        s.score = 10;
      },
    });
  }

  // --- The moon over the About sky: the cat sits in it all night (it outranks the titles that swap) ---
  {
    const b = new ProfileBuilder();
    b.disc(0, 36, 36, null);
    const s = b.build("moon", "perch");
    next.push({
      surface: s,
      place: (s) => {
        setTranslate(s.m, stage.moon.x, stage.moon.y);
        s.valid = stage.moon.valid;
        s.score = 3;
      },
    });
  }

  // --- About: the statement headline ---
  const statement = q(".statement");
  if (statement) {
    const s = withoutTransforms([statement, ...statement.querySelectorAll(".w")], () => {
      const origin = statement.getBoundingClientRect();
      const b = new ProfileBuilder();
      // Only the first line: that's the skyline the cat walks on.
      const words = Array.from(statement.querySelectorAll<HTMLElement>(".w"));
      const firstTop = words[0]?.offsetTop ?? 0;
      for (const w of words) if (Math.abs(w.offsetTop - firstTop) < 4) addText(b, w, origin, { dipEl: () => w });
      return b.build("statement", "text");
    });
    next.push({
      surface: s,
      place: (s, _vw, vh) => {
        const r = statement.getBoundingClientRect();
        setTranslate(s.m, r.left, r.top);
        const y = screenTop(s);
        s.valid = band(y, vh) > 0;
        s.score = band(y, vh) * 1.5;
      },
    });
  }

  // --- About: the what-I-do window under the statement (the cat walks along its title bar) ---
  const ticker = q(".ticker");
  if (ticker) {
    const s = withoutTransforms([ticker], () => {
      const r = ticker.getBoundingClientRect();
      const b = new ProfileBuilder();
      b.block(0, r.width, SINK, 18, ticker);
      return b.build("ticker", "block");
    });
    next.push({
      surface: s,
      place: (s, _vw, vh) => {
        const r = ticker.getBoundingClientRect();
        setTranslate(s.m, r.left, r.top);
        s.valid = band(r.top, vh) > 0;
        s.score = band(r.top, vh) * 1.4;
      },
    });
  }

  // --- Work ---
  const work = q(".work");
  const track = q(".work-track");
  const pinnedNow = (vw: number, vh: number) => {
    if (!work || vw < 900) return false;
    const r = work.getBoundingClientRect();
    return r.top <= 1 && r.bottom >= vh - 1;
  };
  // The images wipe open from the right (clip-path inset): only the revealed part is there.
  const clipOf = (media: HTMLElement): Part["mask"] => {
    const height = media.offsetHeight;
    return () => {
      const m = /inset\(\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%/.exec(media.style.clipPath);
      if (!m) return null;
      const top = parseFloat(m[1]);
      const left = parseFloat(m[4]);
      if (top < 0.2 && left < 0.2) return null;
      return { left: left / 100, drop: (height * top) / 100 };
    };
  };

  if (desktop && work && track) {
    // One compound surface for the whole horizontal track, in the track's own frame.
    const panels = Array.from(track.querySelectorAll<HTMLElement>(".panel"));
    const endIcon = track.querySelector<HTMLElement>(".more-icon");
    const s = withoutTransforms([track, ...panels, ...track.querySelectorAll(".char"), ...track.querySelectorAll(".panel-media"), q(".more-link")], () => {
      const origin = track.getBoundingClientRect();
      const b = new ProfileBuilder();
      const heading = track.querySelector<HTMLElement>(".work-heading .word");
      if (heading) addText(b, heading, origin, { dipEl: charMask, animated: true });
      for (const media of track.querySelectorAll<HTMLElement>(".panel-media")) {
        const r = media.getBoundingClientRect();
        b.block(r.left - origin.left, r.right - origin.left, r.top - origin.top + SINK, 22, media, undefined, clipOf(media));
      }
      // ("And much more" stays out: the cat's spot at the end is the GitHub mark below it.)
      const icon = track.querySelector<HTMLElement>(".more-icon");
      if (icon) {
        const r = icon.getBoundingClientRect();
        // The mark is a ring with the octocat inside: its outer edge is the top.
        b.disc(r.left - origin.left + r.width / 2, r.top - origin.top + r.height / 2 + SINK, r.width / 2, icon);
      }
      return b.build("track", "track");
    });
    next.push({
      surface: s,
      place: (s, vw, vh) => {
        const r = track.getBoundingClientRect();
        setTranslate(s.m, r.left, r.top);
        const pinned = pinnedNow(vw, vh);
        // Before / after the pin it scrolls like any page content: fine while any of it is on screen.
        const bnd = pinned ? 1 : visibleBand(s, vw, vh);
        s.valid = pinned || bnd > 0;
        s.score = pinned ? 4 : bnd * 1.5;
        // The cat runs alongside at ~42% of the width; as the GitHub mark slides in at the end of the
        // gallery its spot glides over to it, so it ends up sitting on the logo.
        s.prefX = vw * 0.42;
        if (endIcon) {
          const ir = endIcon.getBoundingClientRect();
          const cx = ir.left + ir.width / 2;
          const k = Math.min(1, Math.max(0, (vw * 0.95 - cx) / (vw * 0.35)));
          s.prefX += (cx - s.prefX) * k * k * (3 - 2 * k);
        }
      },
    });
  } else if (work) {
    // Phones: the gallery is a vertical stack. Each image top (and the heading) is its own ledge.
    const heading = work.querySelector<HTMLElement>(".work-heading .word");
    if (heading) next.push(textSurface("heading", heading, { animated: true }));
    work.querySelectorAll<HTMLElement>(".panel-media").forEach((media, i) => {
      const s = withoutTransforms([media], () => {
        const r = media.getBoundingClientRect();
        const b = new ProfileBuilder();
        b.block(0, r.width, SINK, 18, media, undefined, clipOf(media));
        return b.build(`panel-${i}`, "block");
      });
      next.push({
        surface: s,
        place: (s, _vw, vh) => {
          const r = media.getBoundingClientRect();
          setTranslate(s.m, r.left, r.top);
          s.valid = band(r.top, vh) > 0;
          s.score = band(r.top, vh) * 1.5;
        },
      });
    });
    const icon = work.querySelector<HTMLElement>(".more-icon");
    if (icon) {
      const b = new ProfileBuilder();
      const s0 = withoutTransforms([icon, q(".more-link")], () => {
        const r = icon.getBoundingClientRect();
        b.disc(r.width / 2, r.height / 2 + SINK, r.width / 2, icon);
        return b.build("github", "block");
      });
      next.push({
        surface: s0,
        place: (s, _vw, vh) => {
          const r = icon.getBoundingClientRect();
          setTranslate(s.m, r.left, r.top);
          s.valid = band(r.top, vh) > 0;
          s.score = band(r.top, vh) * 1.4;
        },
      });
    }
  }

  // --- About stage: the ability title that is showing (the words swap under the cat) ---
  const abList = q(".ab-list");
  if (abList) {
    const titles = Array.from(abList.querySelectorAll<HTMLElement>(".ab-title"));
    const s0 = withoutTransforms([abList, ...abList.querySelectorAll(".ability"), ...abList.querySelectorAll(".char"), ...abList.querySelectorAll(".char-mask")], () => {
      // Hidden abilities are laid out too (visibility: hidden), so they can all be measured now.
      const origin = abList.getBoundingClientRect();
      const b = new ProfileBuilder();
      for (const title of titles) {
        const first = title.querySelector<HTMLElement>(".word");
        const top = first?.offsetTop ?? 0;
        // Only the first line of each title: that's the ledge.
        for (const w of title.querySelectorAll<HTMLElement>(".word")) if (Math.abs(w.offsetTop - top) < 4) addText(b, w, origin, { dipEl: charMask, animated: true });
      }
      return b.build("stage", "text");
    });
    next.push({
      surface: s0,
      place: (s, vw, vh) => {
        const r = abList.getBoundingClientRect();
        setTranslate(s.m, r.left, r.top);
        const bnd = visibleBand(s, vw, vh);
        s.valid = bnd > 0;
        s.score = bnd * 1.7;
      },
    });
  }

  // --- Say hi ---
  const say = q(".sayhi");
  if (say) next.push(textSurface("sayhi", say, { animated: true, score: 1.4 }));

  // --- The garden floor at the very bottom ---
  const contact = q(".contact");
  if (contact) {
    const b = new ProfileBuilder();
    b.block(-4000, 8000, 0, 0, null);
    const s = b.build("floor", "floor");
    next.push({
      surface: s,
      place: (s, vw, vh) => {
        const r = contact.getBoundingClientRect();
        // Just above the footer line, well below the links.
        const y = r.bottom - floorLift(vw);
        setTranslate(s.m, 0, y);
        s.valid = y > vh * 0.45 && y < vh + 4;
        s.score = s.valid ? 5 : 0;
        stage.floorY = y;
        stage.playground = s.valid;
        // You've left the garden once the section above it has most of the screen again.
        stage.garden = r.top < vh * (stage.garden ? 0.55 : 0.45);
      },
    });
  }

  bound = next;
  live.epoch++;
}

function textSurface(id: string, el: HTMLElement, opts: { animated?: boolean; score?: number } = {}): Bound {
  const s = withoutTransforms([el, ...el.querySelectorAll(".char"), ...el.querySelectorAll(".char-mask")], () => {
    const origin = el.getBoundingClientRect();
    const b = new ProfileBuilder();
    addText(b, el, origin, { dipEl: charMask, animated: opts.animated });
    return b.build(id, "text");
  });
  return {
    surface: s,
    place: (s, _vw, vh) => {
      const r = el.getBoundingClientRect();
      setTranslate(s.m, r.left, r.top);
      const y = screenTop(s);
      s.valid = band(y, vh) > 0;
      s.score = band(y, vh) * (opts.score ?? 1.5);
    },
  };
}

export function measurePlatforms(vw: number, vh: number, dt: number): Surface[] {
  if (!bound.length) bindPlatforms();
  const catH = catHeight(vw);
  const out: Surface[] = [];
  for (const b of bound) {
    const s = b.surface;
    const ex = s.m.e;
    const ey = s.m.f;
    const was = s.valid;
    b.place(s, vw, vh);
    if (was) velocity(s, ex, ey, dt);
    else s.vx = s.vy = 0;
    refresh(s);
    // Paws bridge valleys narrower than a stride and step over hairline gaps between letters;
    // word spaces, the drop after an L and deep notches stay gaps (to be jumped).
    if (s.valid && (s.kind === "text" || s.kind === "treadmill" || s.kind === "track")) computeWalk(s, catH * 0.45, catH * 0.22);
    else s.walk.set(s.h);
    out.push(s);
  }
  return out;
}

// Letters / images give way under the cat's weight (the dip also moves the surface, so paws follow).
export function dip(s: Surface, lx: number, range: number, strength: number) {
  for (const p of s.parts) {
    if (!p.el) continue;
    const x0 = s.lx0 + p.i0 * STEP;
    const x1 = s.lx0 + p.i1 * STEP;
    const d = lx < x0 ? x0 - lx : lx > x1 ? lx - x1 : 0;
    if (d > range) continue;
    const amount = strength * Math.pow(1 - d / range, 1.4);
    const el = p.el;
    const set = () => el.style.setProperty("--dip", `${p.dip.v.toFixed(2)}px`);
    gsap.killTweensOf(p.dip);
    gsap
      .timeline({ onUpdate: set })
      .to(p.dip, { v: amount, duration: 0.07, ease: "power2.out", onUpdate: set })
      .to(p.dip, { v: 0, duration: 1.1, ease: "elastic.out(1, 0.28)", onUpdate: set });
  }
}
