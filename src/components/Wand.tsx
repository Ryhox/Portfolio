"use client";

import { useEffect } from "react";
import { stage } from "@/lib/stage";

// In the garden the cursor becomes a bubble wand: wave it to blow bubbles, click for a big puff. This is
// the pointer side of it (where the wand is, how fast it moves, what it blows); the wand itself is 3D, on
// the stage canvas (see stage/Wand3D).
export default function Wand() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const html = document.documentElement;

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
      stage.wand.vy = vy;
      if (!on) return;
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
      stage.wand.puff = performance.now() / 1000;
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

  return null;
}
