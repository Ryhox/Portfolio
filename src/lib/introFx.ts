// Handshake between the DOM preloader and the WebGL intro (rendered on the stage canvas).
export const introFx = {
  // performance.now() seconds when the bubble is born; -1 = idle.
  t0: -1,
  // Where the bubbles are born (one per counter glyph), in screen px.
  seeds: [] as { x: number; y: number; r: number }[],
  // Called once the WebGL curtain is on screen, so the DOM loader can be removed underneath.
  onCover: null as null | (() => void),
  // Called at the moment the bubble pops (the page is revealed).
  onPop: null as null | (() => void),
  // Called when the transition has fully finished.
  onDone: null as null | (() => void),
};
