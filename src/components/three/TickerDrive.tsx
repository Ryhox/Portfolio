"use client";

import { useEffect } from "react";
import { advance, useThree } from "@react-three/fiber";
import { gsap } from "gsap";

// Renders this canvas from the GSAP ticker, right after Lenis has scrolled and ScrollTrigger has
// updated the DOM, so anything anchored to the page (the cat on a headline) never lags a frame.
// Until `active()` is true the canvas only ticks a few times per second, leaving the loader smooth.
export default function TickerDrive({ active }: { active?: () => boolean }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    let frame = 0;
    const tick = (time: number) => {
      frame++;
      if (active && !active() && frame % 12 !== 0) return;
      // R3F expects seconds here (it derives the frame delta from it).
      advance(time, true, get());
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [get, active]);
  return null;
}
