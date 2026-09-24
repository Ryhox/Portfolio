# ryhox — portfolio

Next.js 16 + React Three Fiber + GSAP ScrollTrigger + Lenis.

```bash
npm install
npm run dev
```

## Where things live

- `src/content.ts` — all copy: statement, projects (with images in `public/work/`), socials.
- `src/components/Motion.tsx` — DOM scroll choreography (word reveal, marquee, pinned horizontal gallery, "Say hi").
- `src/components/three/` — the 3D layer: liquid hero lettering, glass bubbles, Y2K charms, holographic shader (`materials.ts`).
- `src/components/three/Cat.tsx` — the chonky cat rig (procedural gait, hops, bubble juggling). Currently parked; mount `<Cat />` and `<PlayBubble />` in `Scene.tsx` to bring it back.

## Asset scripts

- `npm run letters` — re-bakes `public/models/letters.glb` from the stroke definitions in `src/components/three/liquidLetters.ts`.
- `npm run cat` — strips the Sketchfab trio down to one cat (`public/models/cat.glb`).

The cat model is "Chonky Cat Trio" by Kanna-Nakajima, CC BY 4.0 — credit it on the page when the cat is shown.
