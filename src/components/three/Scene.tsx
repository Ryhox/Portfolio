"use client";

import { Suspense, useEffect, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import * as THREE from "three";
import Backdrop from "./Backdrop";
import IntroFX from "./IntroFX";
import HeroTitle from "./HeroTitle";
import Bubbles from "./Bubbles";
import Charms from "./Charms";
import HoloEnvironment from "./HoloEnvironment";
import TickerDrive from "./TickerDrive";
import AboutSky from "./AboutSky";
import { introFx } from "@/lib/introFx";
import { world } from "./world";
import { holoUniforms } from "./materials";
import { stage } from "@/lib/stage";

// Touch devices get a lighter render budget (they're usually phones with dense screens and small GPUs).
const COARSE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

const CAM_Y = 1.3;
const CAM_Z = 12;

// Keeps the shared world metrics in sync with the viewport. Mounted first so it runs first each frame.
function Rig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useEffect(() => {
    camera.position.set(0, CAM_Y, CAM_Z);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((state) => {
    holoUniforms.uTime.value = state.clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    const dist = Math.hypot(CAM_Y, CAM_Z);
    const H = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
    const W = H * (size.width / size.height);
    world.H = H;
    world.W = W;
    world.camDist = dist;
    world.pxToWorld = (H * 2) / size.height;
    world.k = THREE.MathUtils.clamp((W * 2) / 9, 0.62, 1);

    // Mirror the stage cat (screen px) into this scene's world space.
    const c = stage.cat;
    if (c.visible) {
      world.cat.pos.set((c.x - size.width / 2) * world.pxToWorld, -(c.y - c.h * 0.5 - size.height / 2) * world.pxToWorld, 0.5);
      world.cat.radius = c.h * 0.55 * world.pxToWorld;
      world.cat.airborne = c.airborne;
    } else {
      world.cat.pos.set(0, -100, 0);
      world.cat.radius = 0;
    }
  });
  return null;
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#f6fbff", "#cfe1f6", 1.25]} />
      <directionalLight position={[3, 6, 5]} intensity={1.3} color="#fff7fb" />
      <directionalLight position={[-5, 2, -4]} intensity={0.9} color="#bcdcff" />
      <HoloEnvironment resolution={256} />
    </>
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    // Compile every shader in parallel (KHR_parallel_shader_compile) so the page never freezes,
    // then reveal once the first real frame is on screen.
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .finally(() => {
        if (process.env.NODE_ENV !== "production") console.info("[scene] shaders ready in", Math.round(performance.now() - t0), "ms");
        requestAnimationFrame(() => requestAnimationFrame(() => alive && onReady()));
      });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

// Forwards the global three.js loading progress (models on both canvases) to the preloader.
function Progress({ onProgress }: { onProgress: (p: number) => void }) {
  const progress = useProgress((s) => s.progress);
  useEffect(() => onProgress(progress), [progress, onProgress]);
  return null;
}

export default function Scene({
  eventSource,
  onReady,
  onProgress,
}: {
  eventSource: RefObject<HTMLElement | null>;
  onReady: () => void;
  onProgress: (p: number) => void;
}) {
  return (
    <Canvas
      className="scene-canvas"
      eventSource={eventSource as RefObject<HTMLElement>}
      eventPrefix="client"
      frameloop="never"
      flat
      dpr={COARSE ? [1, 1.5] : [1, 2]}
      camera={{ fov: 32, near: 0.1, far: 60, position: [0, CAM_Y, CAM_Z] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        // Full-resolution refraction keeps the glass letters and bubbles crisp (a bit lighter on phones).
        gl.transmissionResolutionScale = COARSE ? 0.7 : 1;
      }}
    >
      {/* While the loader is up, only tick a few times a second (env map + compile), then full rate. */}
      <TickerDrive active={() => introFx.t0 > 0} />
      <Progress onProgress={onProgress} />
      <Rig />
      <Backdrop />
      <AboutSky />
      <Lights />
      <Suspense fallback={null}>
        <HeroTitle />
        {/* Cat is parked for now — re-enable with <Cat /> and <PlayBubble /> */}
        <Bubbles />
        <Charms />
        <Ready onReady={onReady} />
      </Suspense>
      <IntroFX />
    </Canvas>
  );
}
