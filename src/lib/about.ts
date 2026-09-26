// Shared state for the About sky: written by the scroll choreography, read by the WebGL sky and the cat.
export const about = {
  // 0 → 1 through the pinned About section.
  progress: 0,
  // How far night has fallen: the stars, the moon and the sky bubbles come (and go) with it, and the
  // day sky behind the page darkens to match (see Backdrop).
  vis: 0,
  // Continuous constellation index (0 = first ability ... 4 = last), eases with the scroll.
  focus: 0,
  // Where the line currently being drawn has got to, in screen px (the cat watches it).
  pen: { x: 0, y: 0, active: false },
  // The tool whose star (or name) is hovered: that star flares.
  hover: "",
  // When the ability shown changed (the cat on the title hops as the word swaps under it).
  swap: { at: 0, index: -1 },
};
