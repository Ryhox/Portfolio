"use client";

import { Environment, Lightformer } from "@react-three/drei";

// Sky-studio reflections shared by every holographic material (main scene + stage). Built for polished
// silver: a bright sky overhead, a white horizon band all around, a darker steel-blue floor below (chrome
// needs something dark to show its shape), crisp hotspots in front and a soft pink kiss from behind.
export default function HoloEnvironment({ resolution = 512 }: { resolution?: number }) {
  return (
    <Environment resolution={resolution} frames={1}>
      <color attach="background" args={["#9db3d2"]} />
      <Lightformer form="circle" intensity={1.8} color="#ffffff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={11} />
      <Lightformer form="circle" intensity={1} color="#3b4868" position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={13} />
      {/* The horizon: a bright band left and right, a little blue on one side. */}
      <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[-6, 0.8, 1]} rotation-y={Math.PI / 2} scale={[10, 1.6, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#d6ebff" position={[6, 0.8, 1]} rotation-y={-Math.PI / 2} scale={[10, 1.6, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#8fb8e8" position={[0, -1.2, -7]} scale={[14, 1.4, 1]} />
      {/* Crisp white highlights */}
      <Lightformer form="circle" intensity={6} color="#ffffff" position={[-2.5, 3, 6]} scale={1.1} />
      <Lightformer form="circle" intensity={4} color="#ffffff" position={[3, 1.5, 6]} scale={0.6} />
      <Lightformer form="circle" intensity={1.2} color="#ffc9ec" position={[0, 2.4, -7]} scale={6} />
    </Environment>
  );
}
