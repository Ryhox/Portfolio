"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scroll } from "@/lib/scroll";
import { stage } from "@/lib/stage";
import Snap from "lenis/snap";
import { lenis } from "./SmoothScroll";

gsap.registerPlugin(ScrollTrigger);

// All scroll choreography for the DOM layer. Runs once `ready` flips (after the preloader).
export default function Motion({ ready, onReady }: { ready: boolean; onReady?: () => void }) {
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      // ---------- Project videos: load + play only near the viewport, pause off-screen ----------
      const videos = gsap.utils.toArray<HTMLVideoElement>(".panel-img");
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const v = e.target as HTMLVideoElement;
            if (e.isIntersecting) {
              if (!v.src && v.dataset.src) v.src = v.dataset.src;
              v.play().catch(() => undefined);
            } else if (!v.paused) v.pause();
          }
        },
        // Wide margin: the gallery moves sideways, start a bit before a clip slides in.
        { rootMargin: "30% 60% 30% 60%" },
      );
      videos.forEach((v) => io.observe(v));
      // Quietly buffer every clip in the background shortly after the intro, so they are instant later
      // (desktop only: on phones / data saver they load just before they scroll into view).
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const buffer = window.setTimeout(() => {
        if (saveData || coarse) return;
        videos.forEach((v) => {
          if (!v.src && v.dataset.src) {
            v.preload = "auto";
            v.src = v.dataset.src;
          }
        });
      }, 6000);

      // ---------- Statement: words light up as you read ----------
      gsap.fromTo(
        ".statement .w",
        { opacity: 0.1, y: "0.12em", filter: "blur(6px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          ease: "none",
          stagger: 0.12,
          scrollTrigger: { trigger: ".statement", start: "top 82%", end: "bottom 42%", scrub: true },
        },
      );
      // Highlighter strokes draw in word by word, just after the words light up.
      gsap.utils.toArray<HTMLElement>(".statement .mark").forEach((el) => {
        gsap.fromTo(
          el,
          { "--mark": 0 },
          { "--mark": 1, ease: "none", scrollTrigger: { trigger: el, start: "top 72%", end: "top 52%", scrub: true } },
        );
      });

      gsap.from(".intro-note", {
        opacity: 0,
        y: 30,
        duration: 1.1,
        ease: "expo.out",
        scrollTrigger: { trigger: ".intro-note", start: "top 90%", toggleActions: "play none none reverse" },
      });

      // ---------- Marquee: speed + direction + skew follow the scroll ----------
      const rows = gsap.utils.toArray<HTMLElement>(".marquee-row");
      const loops = rows.map((row) => {
        const inner = row.querySelector<HTMLElement>(".marquee-inner")!;
        const reverse = row.classList.contains("is-reverse");
        return gsap.fromTo(
          inner,
          { xPercent: reverse ? -50 : 0 },
          { xPercent: reverse ? 0 : -50, duration: 38, ease: "none", repeat: -1 },
        );
      });
      const skewTo = rows.map((row) => gsap.quickTo(row, "skewX", { duration: 0.5, ease: "power3.out" }));
      gsap.fromTo(
        ".marquee",
        { rotate: -4, scale: 1.08 },
        {
          rotate: 3,
          scale: 1,
          ease: "none",
          scrollTrigger: { trigger: ".marquee", start: "top bottom", end: "bottom top", scrub: true },
        },
      );
      const rowWidth = rows[0]?.querySelector<HTMLElement>(".marquee-inner")?.offsetWidth ?? 0;
      let dir = 1;
      const onTick = () => {
        const v = scroll.velocity;
        if (Math.abs(v) > 0.2) dir = Math.sign(v);
        const boost = 1 + Math.min(Math.abs(v) * 0.35, 9);
        loops.forEach((l) => l.timeScale(gsap.utils.interpolate(l.timeScale(), dir * boost, 0.12)));
        // Surface speed of the first row, so the cat can run on it like a treadmill.
        if (loops.length) stage.marqueeVel = (-loops[0].timeScale() * rowWidth * 0.5) / 38;
        const skew = gsap.utils.clamp(-14, 14, -v * 0.6);
        skewTo.forEach((q) => q(skew));
      };
      gsap.ticker.add(onTick);

      // ---------- Work: pinned horizontal gallery ----------
      mm.add("(min-width: 900px) and (pointer: fine)", () => {
        // Proximity snapping: only kicks in when you stop close to a resting point, so nothing is skipped
        // and you're never yanked far. Rebuilt whenever ScrollTrigger re-measures the page.
        if (!lenis) return;
        const snap = new Snap(lenis, {
          type: "proximity",
          distanceThreshold: "22%",
          debounce: 260,
          duration: 0.9,
          easing: (x: number) => 1 - Math.pow(1 - x, 4),
        });
        let remove: (() => void)[] = [];
        const build = () => {
          remove.forEach((r) => r());
          remove = [];
          const vh = window.innerHeight;
          const vw = window.innerWidth;
          const abs = (sel: string) => {
            const el = document.querySelector(sel);
            return el ? el.getBoundingClientRect().top + window.scrollY : null;
          };
          const points: number[] = [0];
          const statement = abs(".statement");
          if (statement !== null) points.push(statement - vh * 0.16);
          const marquee = document.querySelector<HTMLElement>(".marquee");
          if (marquee) points.push(marquee.getBoundingClientRect().top + window.scrollY + marquee.offsetHeight / 2 - vh / 2);
          const pin = ScrollTrigger.getAll().find((st) => st.pin === document.querySelector(".work"));
          const track = document.querySelector<HTMLElement>(".work-track");
          if (pin && track) {
            points.push(pin.start);
            const distance = track.scrollWidth - vw;
            document.querySelectorAll<HTMLElement>(".panel, .panel-more").forEach((panel) => {
              const center = panel.offsetLeft + panel.offsetWidth / 2 - vw / 2;
              const p = Math.min(1, Math.max(0, center / distance));
              points.push(pin.start + p * (pin.end - pin.start));
            });
          }
          const contact = abs(".contact");
          if (contact !== null) points.push(contact);
          points.push(document.documentElement.scrollHeight - vh);
          remove = points.map((v) => snap.add(Math.round(v)));
        };
        build();
        ScrollTrigger.addEventListener("refresh", build);
        return () => {
          ScrollTrigger.removeEventListener("refresh", build);
          snap.destroy();
        };
      });

      mm.add("(min-width: 900px)", () => {
        const track = document.querySelector<HTMLElement>(".work-track")!;
        const distance = () => track.scrollWidth - window.innerWidth;
        const slide = gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: ".work",
            pin: true,
            start: "top top",
            end: () => "+=" + distance() * 1.1,
            scrub: true,
            invalidateOnRefresh: true,
          },
        });

        gsap.from(".work-heading .char", {
          yPercent: 135,
          rotate: 10,
          stagger: 0.035,
          duration: 1.2,
          ease: "expo.out",
          scrollTrigger: { trigger: ".work", start: "top 70%", toggleActions: "play none none reverse" },
        });

        gsap.utils.toArray<HTMLElement>(".panel").forEach((panel) => {
          const media = panel.querySelector(".panel-media");
          const img = panel.querySelector(".panel-img");
          const chars = panel.querySelectorAll(".panel-title .char");
          const rest = panel.querySelectorAll(".panel-index, .panel-desc, .panel-meta");

          // Image wipes open from the right, then drifts inside its frame.
          gsap.fromTo(
            media,
            { clipPath: "inset(12% 0% 12% 100% round 28px)" },
            {
              clipPath: "inset(0% 0% 0% 0% round 28px)",
              ease: "none",
              scrollTrigger: { trigger: panel, containerAnimation: slide, start: "left 100%", end: "left 40%", scrub: true },
            },
          );
          gsap.fromTo(
            img,
            { xPercent: -4, scale: 1.1 },
            {
              xPercent: 4,
              scale: 1.02,
              ease: "none",
              scrollTrigger: { trigger: panel, containerAnimation: slide, start: "left right", end: "right left", scrub: true },
            },
          );
          gsap.from(chars, {
            yPercent: 135,
            rotate: 12,
            stagger: 0.025,
            duration: 1,
            ease: "expo.out",
            scrollTrigger: { trigger: panel, containerAnimation: slide, start: "left 70%", toggleActions: "play none none reverse" },
          });
          gsap.from(rest, {
            opacity: 0,
            y: 24,
            stagger: 0.08,
            duration: 0.9,
            ease: "expo.out",
            scrollTrigger: { trigger: panel, containerAnimation: slide, start: "left 60%", toggleActions: "play none none reverse" },
          });
        });

        const more = document.querySelector(".panel-more");
        if (more) {
          gsap.from(more.querySelectorAll(".char"), {
            yPercent: 135,
            rotate: 12,
            stagger: 0.03,
            duration: 1.1,
            ease: "expo.out",
            scrollTrigger: { trigger: more, containerAnimation: slide, start: "left 75%", toggleActions: "play none none reverse" },
          });
          gsap.from(more.querySelector(".more-link"), {
            scale: 0.3,
            rotate: -40,
            autoAlpha: 0,
            duration: 1.2,
            ease: "elastic.out(1, 0.5)",
            scrollTrigger: { trigger: more, containerAnimation: slide, start: "left 65%", toggleActions: "play none none reverse" },
          });
        }

        // Panels lean into the scroll speed.
        const panels = gsap.utils.toArray<HTMLElement>(".panel");
        const lean = panels.map((p) => gsap.quickTo(p, "skewX", { duration: 0.9, ease: "power3.out" }));
        const leanTick = () => {
          const s = gsap.utils.clamp(-3, 3, -scroll.velocity * 0.12);
          lean.forEach((q) => q(s));
        };
        gsap.ticker.add(leanTick);
        return () => gsap.ticker.remove(leanTick);
      });

      mm.add("(max-width: 899px)", () => {
        gsap.utils.toArray<HTMLElement>(".panel").forEach((panel) => {
          gsap.fromTo(
            panel.querySelector(".panel-media"),
            { clipPath: "inset(20% 10% 20% 10% round 20px)" },
            {
              clipPath: "inset(0% 0% 0% 0% round 20px)",
              ease: "none",
              scrollTrigger: { trigger: panel, start: "top 95%", end: "top 45%", scrub: true },
            },
          );
          gsap.from(panel.querySelectorAll(".panel-title .char"), {
            yPercent: 135,
            stagger: 0.02,
            duration: 1,
            ease: "expo.out",
            scrollTrigger: { trigger: panel, start: "top 70%", toggleActions: "play none none reverse" },
          });
        });
      });

      // ---------- Contact: giant "Say hi" rises and swells ----------
      gsap.fromTo(
        ".sayhi .char",
        { yPercent: 140, rotate: 14, scale: 0.6 },
        {
          yPercent: 0,
          rotate: 0,
          scale: 1,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: { trigger: ".contact", start: "top 85%", end: "top 15%", scrub: true },
        },
      );
      gsap.from(".contact-links li", {
        y: 60,
        opacity: 0,
        stagger: 0.1,
        duration: 1.1,
        ease: "expo.out",
        scrollTrigger: { trigger: ".contact-links", start: "top 95%", toggleActions: "play none none reverse" },
      });

      // ---------- Nav hides on the way down, returns on the way up ----------
      const nav = document.querySelector(".nav");
      ScrollTrigger.create({
        start: 120,
        end: "max",
        onUpdate: (self) => gsap.to(nav, { yPercent: self.direction > 0 ? -140 : 0, duration: 0.6, ease: "expo.out", overwrite: true }),
      });

      // ---------- Project media tilts toward the pointer ----------
      const tilts = gsap.utils.toArray<HTMLElement>(".panel").map((panel) => {
        const media = panel.querySelector<HTMLElement>(".panel-media")!;
        const img = panel.querySelector<HTMLElement>(".panel-img")!;
        const rx = gsap.quickTo(media, "rotationX", { duration: 0.8, ease: "power3.out" });
        const ry = gsap.quickTo(media, "rotationY", { duration: 0.8, ease: "power3.out" });
        const tx = gsap.quickTo(img, "x", { duration: 0.8, ease: "power3.out" });
        const ty = gsap.quickTo(img, "y", { duration: 0.8, ease: "power3.out" });
        const move = (e: PointerEvent) => {
          const r = media.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5;
          const ny = (e.clientY - r.top) / r.height - 0.5;
          rx(-ny * 10);
          ry(nx * 12);
          tx(-nx * 30);
          ty(-ny * 20);
        };
        const leave = () => {
          rx(0);
          ry(0);
          tx(0);
          ty(0);
        };
        panel.addEventListener("pointermove", move);
        panel.addEventListener("pointerleave", leave);
        return () => {
          panel.removeEventListener("pointermove", move);
          panel.removeEventListener("pointerleave", leave);
        };
      });

      // ---------- Magnetic links ----------
      const magnets = gsap.utils.toArray<HTMLElement>("[data-magnetic]");
      const cleanups = magnets.map((el) => {
        const x = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
        const y = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          x((e.clientX - (r.left + r.width / 2)) * 0.35);
          y((e.clientY - (r.top + r.height / 2)) * 0.45);
        };
        const leave = () => {
          x(0);
          y(0);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        return () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", leave);
        };
      });

      ScrollTrigger.refresh();
      // Let the refresh (pins, snap points, platform measuring) settle for two frames, then report.
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => onReady?.());
      });

      return () => {
        gsap.ticker.remove(onTick);
        cleanups.forEach((c) => c());
        io.disconnect();
        window.clearTimeout(buffer);
        tilts.forEach((c) => c());
      };
    });
    return () => {
      cancelAnimationFrame(raf);
      ctx.revert();
    };
  }, [ready, onReady]);

  return null;
}
