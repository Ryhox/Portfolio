"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scroll } from "@/lib/scroll";
import { about } from "@/lib/about";
import { marquee } from "@/content";
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

      // ---------- About: statement → pinned constellation stage ----------
      // The stage pins; scroll morphs the sky from one constellation into the next (AboutSky reads
      // `about`); the text panel swaps with it. The sky fades in behind the statement and out after the stage.
      const aboutEl = document.querySelector<HTMLElement>(".about");
      const stageEl = document.querySelector<HTMLElement>(".about-stage");
      const abilityEls = gsap.utils.toArray<HTMLElement>(".ability");
      const N = abilityEls.length;
      const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
      // Stage progress → constellation: a staircase, so each one holds while you read it and morphs between.
      // It starts and ends with the stars floating free (focus < 0 / > N - 1).
      const SPAN = N + 0.45;
      const rawAt = (p: number) => Math.min(N - 0.2, Math.max(-0.75, ((p - 0.04) / 0.92) * SPAN - 0.6));
      const progressFor = (i: number) => 0.04 + ((i + 0.6) / SPAN) * 0.92;
      let aboutTick: (() => void) | null = null;
      const aboutOffs: (() => void)[] = [];
      if (aboutEl && stageEl && N) {
        const pin = ScrollTrigger.create({
          trigger: stageEl,
          pin: true,
          start: "top top",
          end: () => "+=" + window.innerHeight * (SPAN * 0.62 + 0.3),
          invalidateOnRefresh: true,
        });
        const span = ScrollTrigger.create({ trigger: aboutEl, start: "top bottom", end: "bottom top" });
        const strips = gsap.utils.toArray<HTMLElement>(".ab-count-strip, .ab-name-strip");
        const meta = document.querySelector<HTMLElement>(".ab-meta");
        const root = document.documentElement;
        let night = -1;
        let current = -1;
        const show = (i: number) => {
          const prev = current;
          current = i;
          about.swap = { at: performance.now(), index: i };
          // i = -1: nothing yet (the stars haven't formed the first figure), so the counter waits too.
          meta?.classList.toggle("is-on", i >= 0);
          if (i >= 0) strips.forEach((strip, s) => gsap.to(strip, { yPercent: (-100 * i) / N, duration: 0.9, ease: "expo.out", overwrite: true, delay: s * 0.06 }));
          abilityEls.forEach((el, k) => {
            const chars = el.querySelectorAll(".ab-title .char");
            const rest = el.querySelectorAll(".ab-line, .ab-proof");
            const chips: Element[] = [];
            if (k === i) {
              el.classList.add("is-on");
              gsap.killTweensOf([...chars, ...rest, ...chips]);
              const d = prev >= 0 ? 0.16 : 0;
              gsap.fromTo(chars, { yPercent: 118, rotationX: -88, opacity: 0 }, { yPercent: 0, rotationX: 0, opacity: 1, duration: 0.8, stagger: 0.028, ease: "expo.out", delay: d });
              gsap.fromTo(rest, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.05, ease: "expo.out", delay: d + 0.14 });
              gsap.fromTo(chips, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, stagger: 0.045, ease: "back.out(2.4)", delay: d + 0.24 });
            } else if (k === prev) {
              gsap.killTweensOf([...chars, ...rest, ...chips]);
              gsap.to(chars, { yPercent: -110, rotationX: 75, opacity: 0, duration: 0.4, stagger: 0.012, ease: "power3.in" });
              gsap.to([...rest, ...chips], {
                y: -12,
                opacity: 0,
                duration: 0.3,
                ease: "power2.in",
                onComplete: () => {
                  if (current !== k) el.classList.remove("is-on");
                },
              });
            } else el.classList.remove("is-on");
          });
        };
        aboutTick = () => {
          const vh = window.innerHeight;
          const y = scroll.y;
          // Night falls as the constellation stage rises into view (stars, moon and bubbles all at once),
          // and day comes back once the stack is read.
          const enter = clamp01((y - (pin.start - vh * 0.8)) / (vh * 0.65));
          const leave = clamp01((span.end - vh * 0.55 - y) / (vh * 0.7));
          about.vis = Math.min(enter, leave);
          // The page's ink follows the sky (light text at night, see globals.css).
          const n = Math.round(about.vis * 200) / 200;
          if (n !== night) {
            night = n;
            root.style.setProperty("--night", String(n));
          }
          const p = clamp01((y - pin.start) / Math.max(1, pin.end - pin.start));
          about.progress = p;
          // Before the stage the sky is just stars (-1.4 = nothing drawn yet).
          const raw = y < pin.start ? -1.4 + clamp01((y - (pin.start - vh * 0.6)) / (vh * 0.6)) * 0.65 : rawAt(p);
          // Gentle steps: each constellation lingers a little, the morphs stay smooth.
          about.focus = raw - (Math.sin(raw * Math.PI * 2) / (Math.PI * 2)) * 0.6;
          // The first ability's words arrive with its constellation (as the cube starts drawing), not before.
          const idx = about.focus < -0.28 ? -1 : Math.min(N - 1, Math.max(0, Math.round(about.focus)));
          if (idx !== current) show(idx);
        };
        gsap.ticker.add(aboutTick);
        aboutOffs.push(() => root.style.removeProperty("--night"));
      }

      // "Seen in" links fly to the project, wherever it sits in the (sideways) gallery.
      const gotoProject = (e: Event) => {
        const a = e.currentTarget as HTMLAnchorElement;
        const panel = document.getElementById(`project-${a.dataset.goto}`);
        if (!panel || !lenis) return;
        e.preventDefault();
        e.stopPropagation();
        const workPin = ScrollTrigger.getAll().find((st) => st.pin === document.querySelector(".work"));
        const track = document.querySelector<HTMLElement>(".work-track");
        if (workPin && track) {
          const distance = track.scrollWidth - window.innerWidth;
          const center = panel.offsetLeft + panel.offsetWidth / 2 - window.innerWidth / 2;
          lenis.scrollTo(workPin.start + Math.min(1, Math.max(0, center / distance)) * (workPin.end - workPin.start), { duration: 2 });
        } else lenis.scrollTo(panel.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.14, { duration: 1.8 });
      };
      const gotoLinks = gsap.utils.toArray<HTMLAnchorElement>("[data-goto]");
      gotoLinks.forEach((a) => a.addEventListener("click", gotoProject));
      aboutOffs.push(() => gotoLinks.forEach((a) => a.removeEventListener("click", gotoProject)));

      // ---------- Ticker (the music player): runs faster (and backwards) with the scroll ----------
      const tickerEl = document.querySelector<HTMLElement>(".ticker");
      const tickerInner = document.querySelector<HTMLElement>(".ticker-inner");
      // One loop = one copy of the words (12 of them); start far in so "back" never runs out of track.
      const LOOP = 60;
      const WORD = LOOP / (marquee.length * 2);
      const loops = tickerInner ? [gsap.fromTo(tickerInner, { xPercent: 0 }, { xPercent: -50, duration: LOOP, ease: "none", repeat: -1 })] : [];
      loops.forEach((l) => l.totalTime(LOOP * 20));
      let dir = 1;
      let paused = false;
      const onTick = () => {
        const v = scroll.velocity;
        if (Math.abs(v) > 0.2) dir = Math.sign(v);
        const boost = 1 + Math.min(Math.abs(v) * 0.25, 6);
        // Paused: glide to a stop instead of freezing mid-step.
        loops.forEach((l) => l.timeScale(gsap.utils.interpolate(l.timeScale(), paused ? 0 : dir * boost, paused ? 0.14 : 0.1)));
      };
      gsap.ticker.add(onTick);
      // The player's buttons: pause / play, and skip a word back or forward.
      const playBtn = tickerEl?.querySelector<HTMLButtonElement>('[data-tk="play"]');
      const onPlayer = (e: Event) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tk]");
        if (!btn || !tickerEl) return;
        gsap.fromTo(btn, { scale: 0.86 }, { scale: 1, duration: 0.5, ease: "back.out(3)", overwrite: true });
        const kind = btn.dataset.tk;
        if (kind === "play") {
          paused = !paused;
          tickerEl.classList.toggle("is-paused", paused);
          playBtn?.setAttribute("aria-label", paused ? "Play the ticker" : "Pause the ticker");
          return;
        }
        const step = kind === "next" ? WORD : -WORD;
        loops.forEach((l) => gsap.to(l, { totalTime: l.totalTime() + step, duration: 0.55, ease: "power3.out", overwrite: true }));
      };
      tickerEl?.addEventListener("click", onPlayer);
      aboutOffs.push(() => tickerEl?.removeEventListener("click", onPlayer));

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
          // About: one resting point per constellation.
          const ap = ScrollTrigger.getAll().find((st) => st.pin === document.querySelector(".about-stage"));
          if (ap) for (let i = 0; i < N; i++) points.push(ap.start + progressFor(i) * (ap.end - ap.start));
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
          const rest = panel.querySelectorAll(".panel-index, .panel-desc, .panel-meta, .panel-actions > *");

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
          gsap.from(panel.querySelectorAll(".panel-desc, .panel-meta, .panel-actions > *"), {
            opacity: 0,
            y: 24,
            stagger: 0.08,
            duration: 0.9,
            ease: "expo.out",
            scrollTrigger: { trigger: panel, start: "top 60%", toggleActions: "play none none reverse" },
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
        if (aboutTick) gsap.ticker.remove(aboutTick);
        aboutOffs.forEach((o) => o());
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
