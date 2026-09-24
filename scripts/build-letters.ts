// Bakes the liquid hero lettering into a compact GLB so the browser doesn't run marching cubes.
// Run: node scripts/build-letters.ts
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, simplify, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { buildLiquidGlyph } from "../src/components/three/liquidLetters.ts";

const WORD = "ryhox";
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene();

for (const ch of WORD) {
  const t = performance.now();
  const geo = buildLiquidGlyph(ch);
  const pos = geo.getAttribute("position").array as Float32Array;
  const nor = geo.getAttribute("normal").array as Float32Array;
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nor).setBuffer(buffer));
  const mesh = doc.createMesh(ch).addPrimitive(prim);
  scene.addChild(doc.createNode(ch).setMesh(mesh));
  console.log(ch, pos.length / 3, "verts", Math.round(performance.now() - t), "ms");
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.0004 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
await io.write("public/models/letters.glb", doc);
