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
};

export function measureSections() {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-section]"));
  scroll.anchors = {};
  for (const el of els) {
    scroll.anchors[el.dataset.section!] = el.getBoundingClientRect().top + window.scrollY;
  }
  scroll.vh = window.innerHeight;

  const track = document.querySelector<HTMLElement>(".work-track");
  if (track) {
    const items = Array.from(track.children) as HTMLElement[];
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    scroll.galleryGaps = items.map((el) => el.offsetLeft + el.offsetWidth + gap / 2);
  }
}
