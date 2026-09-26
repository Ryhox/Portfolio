"use client";

import { Suspense, useEffect, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HoloEnvironment from "../three/HoloEnvironment";
import TickerDrive from "../three/TickerDrive";
import { intro } from "@/lib/intro";
import CatActor from "./CatActor";
import WandBubbles from "./WandBubbles";
import Garden from "./Garden";
import Grass from "./Grass";
import Wand3D from "./Wand3D";
import Bursts from "./Bursts";
import { flowerGeometries, flowerMaterials } from "./flowers";
import { FOV, PX, TILT, view } from "./view";
import { bindPlatforms, live, measurePlatforms } from "./platforms";

const COARSE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

// Keeps the stage camera mapped 1:1 onto CSS pixels and measures the page's platforms. Runs first.
function StageRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    view.camera = camera;
    const rebind = () => bindPlatforms();
    rebind();
    ScrollTrigger.addEventListener("refresh", rebind);
    window.addEventListener("resize", rebind);
    document.fonts?.ready.then(rebind);
    return () => {
      ScrollTrigger.removeEventListener("refresh", rebind);
      window.removeEventListener("resize", rebind);
    };
  }, [camera]);

  useFrame((state, dt) => {
    view.vw = size.width;
    view.vh = size.height;
    view.pointerX = ((state.pointer.x + 1) / 2) * size.width;
    view.pointerY = ((1 - state.pointer.y) / 2) * size.height;
    const d = (size.height * 0.5 * PX) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.position.set(0, d * Math.sin(TILT), d * Math.cos(TILT));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    live.list = measurePlatforms(size.width, size.height, Math.min(dt, 1 / 20));
  }, -2);

  return null;
}

// Invisible-in-practice meshes so every garden material is compiled with the first warm-up.
function Prewarm() {
  const g = flowerGeometries();
  const m = flowerMaterials();
  return (
    <group position={[0, 0, -60]} scale={0.001}>
      <mesh geometry={g.stem} material={m.stem} />
      <mesh geometry={g.leaf} material={m.center} />
      <mesh geometry={g.leaf} material={m.petals[0]} />
    </group>
  );
}

// Reports ready once the cat is loaded and every stage shader (intro included) is compiled.
function StageReady({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .finally(() => alive && onReady());
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

export default function StageCanvas({
  eventSource,
  onReady,
}: {
  eventSource: RefObject<HTMLElement | null>;
  onReady: () => void;
}) {
  return (
    <Canvas
      className="stage-canvas"
      eventSource={eventSource as RefObject<HTMLElement>}
      eventPrefix="client"
      frameloop="never"
      flat
      dpr={COARSE ? [1, 1.5] : [1, 2]}
      camera={{ fov: FOV, near: 1, far: 200, position: [0, 0, 25] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <TickerDrive active={() => Number.isFinite(intro.at)} />
      <StageRig />
      <hemisphereLight args={["#f8fcff", "#b9cbe6", 1.1]} />
      <directionalLight position={[3, 6, 8]} intensity={1.2} color="#fff8ee" />
      <directionalLight position={[-6, 1, 3]} intensity={0.7} color="#c9d8ff" />
      <HoloEnvironment resolution={256} />
      <Suspense fallback={null}>
        <CatActor />
        <StageReady onReady={onReady} />
      </Suspense>
      <WandBubbles />
      <Grass />
      <Wand3D />
      <Garden />
      <Bursts />
      <Prewarm />
    </Canvas>
  );
}
