import { floorLift } from "./stage";

// Work that must run right after Lenis has moved the page and before anything renders (same frame).
export const afterScroll = new Set<(time: number, deltaMs: number) => void>();

// Shared, mutable scroll state read inside the render loop (no React re-renders).
export const scroll = {
  y: 0,
  velocity: 0,
  vh: 1,
  // Continuous progress through the page, 0..1.
  progress: 0,
  // Legacy 0..3 section scale used by the (parked) cat choreography.
  s: 0,
  // Document-space tops (px) of [data-section="name"] elements, for anchoring 3D objects.
  anchors: {} as Record<string, number>,
  // Centers (px from the gallery track start) of the gaps around the project panels.
  galleryGaps: [] as number[],
  // Document-space y (px) of the floor the page ends on (the meadow, see Backdrop).
  floor: Infinity,
};

export function measureSections() {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-section]"));
  scroll.anchors = {};
  for (const el of els) {
    scroll.anchors[el.dataset.section!] = el.getBoundingClientRect().top + window.scrollY;
  }
  scroll.vh = window.innerHeight;
  const contact = document.querySelector<HTMLElement>(".contact");
  scroll.floor = contact ? contact.getBoundingClientRect().bottom + window.scrollY - floorLift(window.innerWidth) : Infinity;

  const track = document.querySelector<HTMLElement>(".work-track");
  if (track) {
    const items = Array.from(track.children) as HTMLElement[];
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    scroll.galleryGaps = items.map((el) => el.offsetLeft + el.offsetWidth + gap / 2);
  }
}
