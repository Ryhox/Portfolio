import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ryhox ✧ creative developer",
    short_name: "ryhox",
    description: "Playful, shiny 3D things for the web.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0916",
    theme_color: "#0f0b1e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
