"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import SmoothScroll, { lenis } from "./SmoothScroll";
import Motion from "./Motion";
import Wand from "./Wand";
import { intro } from "@/lib/intro";
import { introFx } from "@/lib/introFx";

const Scene = dynamic(() => import("./three/Scene"), { ssr: false });
const StageCanvas = dynamic(() => import("./stage/StageCanvas"), { ssr: false });

// Jelly wobble for a digit that just changed. Web Animations on transform run on the compositor,
// so the counter stays smooth even while the main thread is busy loading.
const JELLY: Keyframe[] = [
  { transform: "translateY(10px) scale(1.16, 0.8)" },
  { transform: "translateY(-4px) scale(0.94, 1.08)", offset: 0.3 },
  { transform: "translateY(1px) scale(1.03, 0.97)", offset: 0.6 },
  { transform: "none" },
];

export default function Experience({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const digits = useRef<(HTMLSpanElement | null)[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const [stageReady, setStageReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Scroll choreography is built while the loader is still up (not at the pop, which must stay buttery).
  const [motionSetup, setMotionSetup] = useState(false);
  const onMotionReady = useCallback(() => setMotionSetup(true), []);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const onStageReady = useCallback(() => setStageReady(true), []);

  // Displayed value eases toward the real loading progress; digits wobble like jelly when they change.
  const progress = useRef({ v: 0, target: 4, finishing: false });
  const render = useCallback(() => {
    const text = String(Math.round(progress.current.v));
    digits.current.forEach((el, i) => {
      if (!el) return;
      const ch = text[i - (3 - text.length)] ?? "";
      el.style.display = ch ? "" : "none";
      if (el.dataset.d === ch) return;
      el.dataset.d = ch;
      el.textContent = ch;
      if (ch) el.animate(JELLY, { duration: 650, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" });
    });
  }, []);

  const onProgress = useCallback((p: number) => {
    // Assets are most of the wait; shader compilation finishes the last stretch.
    progress.current.target = Math.max(progress.current.target, 8 + p * 0.8);
  }, []);

  // Y2K touch: the tab misses you when you leave.
  useEffect(() => {
    const title = document.title;
    const onVisibility = () => {
      document.title = document.hidden ? "✧ come back, the cat misses u ✧" : title;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    lenis?.stop();
    const p = progress.current;
    document.fonts?.ready.then(() => {
      p.target = Math.max(p.target, 14);
    });
    const start = performance.now();
    const tick = () => {
      if (p.finishing) return;
      // Never looks stuck: a slow floor that creeps toward 90% while real progress catches up.
      const floor = 90 * (1 - Math.exp(-(performance.now() - start) / 2600));
      const target = Math.max(p.target, floor);
      const next = p.v + (target - p.v) * 0.09;
      if (Math.abs(next - p.v) > 0.02) {
        p.v = next;
        render();
      }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [render]);

  // Everything compiled: count to 100, burst the digits, and hand over to the WebGL bubble.
  useEffect(() => {
    if (!motionSetup) return;
    const p = progress.current;
    p.finishing = true;

    // Every glyph of "100%" becomes a bubble; measure them before they pop.
    const glyphs = [...digits.current, document.querySelector<HTMLElement>(".loader-pct")].filter(
      (el): el is HTMLElement => !!el && el.style.display !== "none",
    );
    const seeds = () =>
      glyphs.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) * 0.42 };
      });

    const start = () => {
      introFx.onCover = () => {
        // The WebGL curtain matches the loader pixel for pixel: drop the DOM background, keep the fading glyphs.
        if (loader.current) loader.current.style.background = "transparent";
      };
      introFx.onPop = () => {
        intro.at = performance.now() / 1000;
        gsap.fromTo(".scene", { scale: 1.12 }, { scale: 1, duration: 1.7, ease: "expo.out", clearProps: "transform" });
        gsap.from(".nav > *", { yPercent: -160, autoAlpha: 0, duration: 1, stagger: 0.08, ease: "expo.out", delay: 0.5 });
        setRevealed(true);
        lenis?.start();
      };
      introFx.onDone = null;
      introFx.t0 = performance.now() / 1000;
    };

    const tl = gsap.timeline();
    tl.to(p, { v: 100, duration: 0.35, ease: "power2.out", onUpdate: render })
      .add(() => {
        introFx.seeds = seeds();
        start();
      }, "+=0.08")
      // Each glyph melts into the bubble inflating inside it.
      .to(glyphs, { scale: 1.12, autoAlpha: 0, duration: 0.26, stagger: 0.04, ease: "power2.out" }, "+=0.02")
      .add(() => {
        if (loader.current) loader.current.style.display = "none";
      });
    return () => {
      tl.kill();
    };
  }, [motionSetup, render]);

  return (
    <div ref={root} className={revealed ? "app is-ready" : "app"}>
      <SmoothScroll />
      <Motion ready={sceneReady && stageReady} onReady={onMotionReady} />
      <Wand />
      <div className="scene" aria-hidden>
        <Scene eventSource={root} onReady={onSceneReady} onProgress={onProgress} />
      </div>
      <div className="stage" aria-hidden>
        <StageCanvas eventSource={root} onReady={onStageReady} />
      </div>
      <div className="progress" aria-hidden>
        <div className="progress-fill" />
      </div>
      <div ref={loader} className="loader" aria-hidden>
        <div className="loader-count">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="loader-digit"
              data-d={i === 2 ? "0" : ""}
              style={i === 2 ? undefined : { display: "none" }}
              ref={(el) => {
                digits.current[i] = el;
              }}
            >
              {i === 2 ? "0" : ""}
            </span>
          ))}
          <span className="loader-pct">%</span>
        </div>
      </div>
      {children}
    </div>
  );
}
