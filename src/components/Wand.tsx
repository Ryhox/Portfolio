"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { stage } from "@/lib/stage";

// In the garden the cursor becomes a bubble wand: wave it to blow bubbles, click for a big puff.
export default function Wand() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wand = el.current!;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const html = document.documentElement;
    const setX = gsap.quickSetter(wand, "x", "px");
    const setY = gsap.quickSetter(wand, "y", "px");
    const rotate = gsap.quickTo(wand, "rotation", { duration: 0.5, ease: "power3.out" });
    const film = { v: 1 };
    const setFilm = () => wand.style.setProperty("--film", film.v.toFixed(3));

    let on = false;
    let last = { x: 0, y: 0, t: 0 };
    let budget = 0;

    const inZone = (e: PointerEvent) => {
      if (!stage.playground) return false;
      const contact = document.querySelector(".contact");
      const target = e.target as HTMLElement | null;
      if (!contact || target?.closest("a, button")) return false;
      const r = contact.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };

    const emit = (x: number, y: number, vx: number, vy: number, spread: number) => {
      stage.emits.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: vx * 0.35 + (Math.random() - 0.5) * spread,
        vy: vy * 0.35 - 20 + (Math.random() - 0.5) * spread,
      });
      film.v = Math.max(0.15, film.v - 0.35);
      gsap.to(film, { v: 1, duration: 0.7, ease: "power2.out", overwrite: true, onUpdate: setFilm });
      setFilm();
    };

    const setOn = (next: boolean) => {
      if (next === on) return;
      on = next;
      html.classList.toggle("wand-on", on);
      stage.wand.active = on;
    };

    const move = (e: PointerEvent) => {
      if (!fine || e.pointerType === "touch") return;
      setOn(inZone(e));
      const now = performance.now() / 1000;
      const dt = Math.max(1 / 240, Math.min(0.1, now - last.t));
      const vx = (e.clientX - last.x) / dt;
      const vy = (e.clientY - last.y) / dt;
      last = { x: e.clientX, y: e.clientY, t: now };
      stage.wand.x = e.clientX;
      stage.wand.y = e.clientY;
      stage.wand.vx = vx;
      if (!on) return;
      setX(e.clientX);
      setY(e.clientY);
      rotate(-24 + gsap.utils.clamp(-32, 32, vx * 0.018));
      // Waving the wand pushes air through the film: faster = more bubbles.
      const speed = Math.hypot(vx, vy);
      if (speed > 120) budget += (speed * dt) / 46;
      while (budget >= 1) {
        budget -= 1;
        emit(e.clientX, e.clientY, vx, vy, 60);
      }
    };

    const down = (e: PointerEvent) => {
      if (!inZone(e)) return;
      for (let i = 0; i < 7; i++) emit(e.clientX, e.clientY, 0, -120, 360);
      gsap.fromTo(wand, { scale: 0.85 }, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.4)" });
    };

    const leave = () => setOn(false);

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("pointerleave", leave);
    // Scrolling moves the zone under a still pointer.
    const onScroll = () => {
      if (on && !stage.playground) setOn(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", onScroll);
      html.classList.remove("wand-on");
      stage.wand.active = false;
    };
  }, []);

  return (
    <div ref={el} className="wand" aria-hidden>
      <svg viewBox="0 0 64 132" width="64" height="132">
        <defs>
          <linearGradient id="wand-holo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c7b0ff" />
            <stop offset="0.4" stopColor="#ffb1df" />
            <stop offset="0.75" stopColor="#9fd0ff" />
            <stop offset="1" stopColor="#d9c6ff" />
          </linearGradient>
          <radialGradient id="wand-film" cx="0.38" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#f6d6ff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#a8d3ff" stopOpacity="0.4" />
          </radialGradient>
        </defs>
        <circle className="wand-film" cx="32" cy="32" r="20" fill="url(#wand-film)" />
        <circle cx="32" cy="32" r="22" fill="none" stroke="url(#wand-holo)" strokeWidth="5.5" />
        <circle cx="26" cy="22" r="3" fill="#fff" opacity="0.85" />
        <rect x="29" y="55" width="6" height="68" rx="3" fill="url(#wand-holo)" />
        <path d="M32 116 Q33.4 121.6 39 123 Q33.4 124.4 32 130 Q30.6 124.4 25 123 Q30.6 121.6 32 116Z" fill="#fff" />
      </svg>
    </div>
  );
}
