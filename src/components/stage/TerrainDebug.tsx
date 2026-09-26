"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { stage } from "@/lib/stage";
import { live } from "./platforms";
import { heightAt, toLocal, toScreen } from "./terrain";

// Dev aid: open the page with ?terrain to see every surface the cat can stand on, drawn over the page.
export default function TerrainDebug() {
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("terrain")) return;
    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed;inset:0;z-index:90;pointer-events:none";
    document.body.appendChild(c);
    const ctx = c.getContext("2d")!;
    const p = { x: 0, y: 0 };
    const q = { x: 0, y: 0 };
    const draw = () => {
      const w = innerWidth;
      const h = innerHeight;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      for (const s of live.list) {
        ctx.strokeStyle = s.valid ? "#39ff88" : "rgba(255,80,80,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        let open = false;
        for (let x = -20; x < w + 20; x += 2) {
          toLocal(s, x, h / 2, q);
          const y = heightAt(s, q.x);
          if (y !== y) {
            open = false;
            continue;
          }
          toScreen(s, q.x, y, p);
          if (p.y < -50 || p.y > h + 50) {
            open = false;
            continue;
          }
          if (open) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
          open = true;
        }
        ctx.stroke();
      }
      const cat = stage.cat;
      if (cat.visible) {
        ctx.fillStyle = "#ff3df0";
        ctx.fillRect(cat.x - 3, cat.y - 3, 6, 6);
      }
    };
    gsap.ticker.add(draw);
    return () => {
      gsap.ticker.remove(draw);
      c.remove();
    };
  }, []);
  return null;
}
