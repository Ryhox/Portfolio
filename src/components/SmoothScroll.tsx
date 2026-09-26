"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { afterScroll, measureSections, scroll } from "@/lib/scroll";

gsap.registerPlugin(ScrollTrigger);

export let lenis: Lenis | null = null;

export default function SmoothScroll() {
  useEffect(() => {
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    // Snappier catch-up and shorter wheel steps: still silky, but a flick doesn't coast past whole sections.
    const instance = new Lenis({ lerp: 0.12, wheelMultiplier: 0.8 });
    lenis = instance;

    const fill = document.querySelector<HTMLElement>(".progress-fill");
    instance.on("scroll", (l: Lenis) => {
      const p = Math.min(1, Math.max(0, l.progress || 0));
      if (fill) fill.style.transform = `scaleX(${p})`;
      document.documentElement.style.setProperty("--scrolled", Math.min(1, l.scroll / (window.innerHeight * 0.15)).toFixed(3));
      scroll.y = l.scroll;
      scroll.velocity = l.velocity;
      scroll.progress = l.progress;
      scroll.s = l.progress * 3;
      ScrollTrigger.update();
    });

    // One clock for Lenis + GSAP so pinned/scrubbed animations never drift from the scroll.
    const tick = (time: number, deltaMs: number) => {
      instance.raf(time * 1000);
      afterScroll.forEach((fn) => fn(time, deltaMs));
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // In-page links: pinned sections report their pinned position, so resolve the start of their pin.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href")!.slice(1);
      const el = id ? document.getElementById(id) : null;
      if (!id && a.getAttribute("href") !== "#") return;
      e.preventDefault();
      if (!el || id === "top") return instance.scrollTo(0, { duration: 1.6 });
      const pin = ScrollTrigger.getAll().find((st) => st.pin === el || st.trigger === el);
      const target = pin ? pin.start : el.getBoundingClientRect().top + window.scrollY;
      instance.scrollTo(target, { duration: 1.6 });
    };
    document.addEventListener("click", onClick);

    const onRefresh = () => measureSections();
    ScrollTrigger.addEventListener("refresh", onRefresh);
    measureSections();

    return () => {
      gsap.ticker.remove(tick);
      document.removeEventListener("click", onClick);
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      instance.destroy();
      lenis = null;
    };
  }, []);

  return null;
}
