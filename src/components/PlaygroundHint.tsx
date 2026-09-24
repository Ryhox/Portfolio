"use client";

import { useEffect, useState } from "react";
import { stage } from "@/lib/stage";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Footer line for the bubble garden: a hint first, then the cat's score.
export default function PlaygroundHint() {
  const [text, setText] = useState("");

  useEffect(() => {
    const touch = !window.matchMedia("(pointer: fine)").matches;
    const hint = touch ? "tap down here to blow bubbles for the cat" : "psst, wave the wand down here";
    const update = ({ pops, flowers }: { pops: number; flowers: number }) =>
      setText(
        pops === 0 && flowers === 0
          ? hint
          : `the cat caught ${plural(pops, "bubble", "bubbles")} · ${plural(flowers, "flower", "flowers")} grown`,
      );
    stage.onStats = update;
    update(stage.stats);
    return () => {
      stage.onStats = null;
    };
  }, []);

  return (
    <span className="playground-hint" aria-live="polite">
      {text}
    </span>
  );
}
