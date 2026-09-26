// Shared, mutable state for the foreground "stage" (the cat layer above the page).
// Everything is in screen pixels (y down) so DOM, main canvas and stage canvas can talk to each other.

// How far above the bottom of the contact section the floor is (the cat, the flowers and the meadow
// the page ends in; the footer sits on the grass below it). On phones the footer stacks into three lines.
export const floorLift = (vw: number) => (vw < 900 ? 112 : 64);

export type Emit = { x: number; y: number; vx: number; vy: number };
export type BurstRequest = { x: number; y: number; r: number; hearts?: boolean; sparkle?: boolean };
export type LiveBubble = { id: number; x: number; y: number; r: number; alive: boolean };

export const stage = {
  // Top of the "o" in the hero lettering, projected from the main canvas.
  perch: { x: 0, y: 0, vx: 0, vy: 0, valid: false },
  // The seat in the crescent moon over the About sky, projected from the main canvas (the cat sits in it at night).
  moon: { x: 0, y: 0, valid: false },
  // Where the cat is, for bubbles, charms and the main scene.
  cat: {
    visible: false,
    x: -9999,
    y: -9999,
    vx: 0,
    h: 90,
    airborne: false,
    head: { x: -9999, y: -9999, r: 0 },
  },
  // Bubble garden.
  floorY: 0,
  playground: false,
  // Still in the garden (the last section)? Its bubbles all pop once you scroll back up and out.
  garden: false,
  // The bubble wand (the pointer, in the garden): where it is, how fast it moves, when it last puffed.
  wand: { active: false, x: 0, y: 0, vx: 0, vy: 0, puff: -9 },
  emits: [] as Emit[],
  bubbles: [] as LiveBubble[],
  plants: [] as number[],
  // Screen x of every flower in the garden (the cat likes to sniff them).
  flowerXs: [] as number[],
  bursts: [] as BurstRequest[],
  // Incremented when the cat catches a bubble (the cat reacts to it).
  catches: 0,
  stats: { pops: 0, flowers: 0 },
  onStats: null as null | ((s: { pops: number; flowers: number }) => void),
};

export function publishStats() {
  stage.onStats?.({ ...stage.stats });
}
