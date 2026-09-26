"use client";

import { useEffect } from "react";
import { gsap } from "gsap";

// Project buttons. The fill grows from where the pointer came in and shrinks toward where it left, with a
// light magnetic pull (the rest is CSS, see .act). Hovering a button also takes over the picture above:
// "Live demo" turns it into a browser loading the real address, "Source code" decodes the running video
// into characters, and a project without a demo gets stamped.

const GLYPHS = " .:-=+*/<>{}[]()#%&@";

type Ascii = { start: () => void; stop: () => void; dispose: () => void };

function asciiFor(media: HTMLElement): Ascii | null {
  const canvas = media.querySelector<HTMLCanvasElement>(".mfx-ascii");
  const video = media.querySelector<HTMLVideoElement>("video");
  if (!canvas || !video) return null;
  const ctx = canvas.getContext("2d");
  const small = document.createElement("canvas");
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!ctx || !sctx) return null;
  const poster = new Image();
  if (video.poster) poster.src = video.poster;
  let p = 0;
  let target = 0;
  let running = false;
  let last = 0;

  // The part of the frame that object-fit: cover actually shows.
  const cover = (sw: number, sh: number, w: number, h: number) => {
    const pos = getComputedStyle(video).objectPosition.split(" ").map((v) => parseFloat(v) / 100);
    const fx = Number.isFinite(pos[0]) ? pos[0] : 0.5;
    const fy = Number.isFinite(pos[1]) ? pos[1] : 0.5;
    const s = Math.max(w / sw, h / sh);
    const cw = w / s;
    const ch = h / s;
    return [(sw - cw) * fx, (sh - ch) * fy, cw, ch];
  };

  const frame = (time: number) => {
    const dt = last ? Math.min(0.05, time - last) : 1 / 60;
    last = time;
    p += (target > p ? 1 : -1) * dt * (target > p ? 2.2 : 3.2);
    p = Math.min(1, Math.max(0, p));
    const w = media.clientWidth;
    const h = media.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (p <= 0 && target === 0) {
      ctx.clearRect(0, 0, w, h);
      running = false;
      gsap.ticker.remove(frame);
      last = 0;
      return;
    }
    // Nothing to read this frame (the video is seeking or looping): keep the last frame rather than blink.
    const src: CanvasImageSource | null = video.readyState >= 2 ? video : poster.complete && poster.naturalWidth ? poster : null;
    if (!src) return;
    ctx.clearRect(0, 0, w, h);
    const cw = w < 600 ? 8 : 10;
    const chH = cw * 1.5;
    const cols = Math.ceil(w / cw);
    const rows = Math.ceil(h / chH);
    small.width = cols;
    small.height = rows;
    const sw = src === video ? video.videoWidth : poster.naturalWidth;
    const sh = src === video ? video.videoHeight : poster.naturalHeight;
    const [sx, sy, sW, sH] = cover(sw, sh, w, h);
    sctx.drawImage(src, sx, sy, sW, sH, 0, 0, cols, rows);
    const data = sctx.getImageData(0, 0, cols, rows).data;
    // The wipe runs left → right; a band of scrambled glyphs rides the edge.
    const edge = p * (cols + 16) - 8;
    ctx.fillStyle = "rgba(9, 22, 58, 0.94)";
    ctx.fillRect(0, 0, Math.max(0, Math.min(cols, edge)) * cw, h);
    ctx.font = `700 ${Math.round(chH * 0.82)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.textBaseline = "top";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c > edge + 2) break;
        const i = (r * cols + c) * 4;
        const R = data[i];
        const G = data[i + 1];
        const B = data[i + 2];
        const lum = (0.3 * R + 0.59 * G + 0.11 * B) / 255;
        const nearEdge = Math.abs(c - edge) < 2.5;
        const g = nearEdge ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(Math.pow(Math.max(0, lum - 0.09) / 0.91, 0.85) * GLYPHS.length))];
        if (g === " ") continue;
        ctx.fillStyle = nearEdge ? "#fff" : `rgb(${(R * 0.6 + 92) | 0},${(G * 0.6 + 104) | 0},${(B * 0.6 + 124) | 0})`;
        ctx.fillText(g, c * cw, r * chH);
      }
    }
  };

  return {
    start() {
      target = 1;
      if (!running) {
        running = true;
        gsap.ticker.add(frame);
      }
    },
    stop() {
      target = 0;
    },
    dispose() {
      gsap.ticker.remove(frame);
    },
  };
}

export default function ActionFx({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offs: (() => void)[] = [];

    // Flood fill + magnetic pull.
    for (const el of document.querySelectorAll<HTMLElement>("[data-act]")) {
      const mx = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
      const my = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
      const at = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--x", `${e.clientX - r.left}px`);
        el.style.setProperty("--y", `${e.clientY - r.top}px`);
      };
      const enter = (e: PointerEvent) => {
        at(e);
        el.classList.add("is-on");
      };
      const move = (e: PointerEvent) => {
        if (!fine || e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        mx((e.clientX - (r.left + r.width / 2)) * 0.16);
        my((e.clientY - (r.top + r.height / 2)) * 0.28);
      };
      const leave = (e: PointerEvent) => {
        at(e);
        el.classList.remove("is-on");
        mx(0);
        my(0);
      };
      const focus = () => {
        if (!el.matches(":focus-visible")) return;
        el.style.setProperty("--x", "50%");
        el.style.setProperty("--y", "50%");
        el.classList.add("is-on");
      };
      const blur = () => el.classList.remove("is-on");
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      el.addEventListener("focus", focus);
      el.addEventListener("blur", blur);
      offs.push(() => {
        el.removeEventListener("pointerenter", enter);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
        el.removeEventListener("focus", focus);
        el.removeEventListener("blur", blur);
      });
    }

    // The picture reacts to the button you're on.
    if (fine && !reduced) {
      for (const panel of document.querySelectorAll<HTMLElement>(".panel")) {
        const media = panel.querySelector<HTMLElement>(".panel-media");
        if (!media) continue;
        const ascii = asciiFor(media);
        const bind = (sel: string, cls: string, on?: () => void, off?: () => void) => {
          const btn = panel.querySelector<HTMLElement>(sel);
          if (!btn) return;
          const enter = () => {
            panel.classList.add(cls);
            on?.();
          };
          const leave = () => {
            panel.classList.remove(cls);
            off?.();
          };
          btn.addEventListener("pointerenter", enter);
          btn.addEventListener("pointerleave", leave);
          btn.addEventListener("focus", enter);
          btn.addEventListener("blur", leave);
          offs.push(() => {
            btn.removeEventListener("pointerenter", enter);
            btn.removeEventListener("pointerleave", leave);
            btn.removeEventListener("focus", enter);
            btn.removeEventListener("blur", leave);
          });
        };
        bind(".act--solid", "is-demo");
        bind(
          ".act--line",
          "is-code",
          () => ascii?.start(),
          () => ascii?.stop(),
        );
        bind(".act--none", "is-none");
        if (ascii) offs.push(() => ascii.dispose());
      }
    }
    return () => offs.forEach((o) => o());
  }, [ready]);

  return null;
}
