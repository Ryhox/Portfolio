// Keeps only the first cat (Cat01) from the trio and drops the rest + the ground cube.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup } from "@gltf-transform/functions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("public/models/cats.glb");
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (mesh && !node.getName().startsWith("fat_cat_white_Cat01")) node.dispose();
}
for (const skin of doc.getRoot().listSkins()) skin.dispose();
await doc.transform(prune(), dedup());
await io.write("public/models/cat.glb", doc);
