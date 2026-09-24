"use client";

import { Environment, Lightformer } from "@react-three/drei";

// Pastel studio reflections shared by every holographic material (main scene + stage).
export default function HoloEnvironment({ resolution = 512 }: { resolution?: number }) {
  return (
    <Environment resolution={resolution} frames={1}>
      <color attach="background" args={["#2a2050"]} />
      {/* Large soft panels: a candy pink / violet / baby-blue sweep with no hard edges. */}
      <Lightformer form="circle" intensity={2.2} color="#ff9ad6" position={[-6, 1, 2]} rotation-y={Math.PI / 2} scale={9} />
      <Lightformer form="circle" intensity={2.2} color="#86b8ff" position={[6, 1, 2]} rotation-y={-Math.PI / 2} scale={9} />
      <Lightformer form="circle" intensity={1.6} color="#a98bff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={10} />
      <Lightformer form="circle" intensity={1.2} color="#6c4fd6" position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={10} />
      {/* Crisp white highlights */}
      <Lightformer form="circle" intensity={7} color="#ffffff" position={[-2.5, 3, 6]} scale={1.1} />
      <Lightformer form="circle" intensity={5} color="#ffffff" position={[3, 1.5, 6]} scale={0.6} />
      <Lightformer form="circle" intensity={1.6} color="#ffd6f1" position={[0, 0, -7]} scale={10} />
    </Environment>
  );
}
