export const profile = {
  handle: "ryhox",
  role: "Creative developer",
  statement:
    "I build ==playful, tactile things== for the web — 3D worlds, apps people open every day, and experiments that have ==no business existing.==",
  note: "Open for freelance, collabs and weird ideas.",
};

export const marquee = ["Creative developer", "Three.js", "WebGL", "Apps", "Interfaces", "Experiments"];

export const github = { handle: "Ryhox", href: "https://github.com/Ryhox" };

// Clips are pre-encoded small (H.264, 1120px, no audio, faststart) with a WebP poster for instant paint.
export const projects = [
  {
    title: "Stargazer Islands",
    description: "An explorable Three.js island world. Star the repo and you get your own island in it.",
    stack: "Three.js · React Three Fiber · GLSL",
    video: "/work/stargazer.mp4",
    poster: "/work/stargazer.webp",
    href: "https://github.com/Ryhox/Stargazer-Islands",
  },
  {
    title: "Wieland AI",
    description: "A locally hosted AI assistant running on Ollama. Private, fast, no cloud required.",
    stack: "JavaScript · Ollama",
    video: "/work/wieland.mp4",
    poster: "/work/wieland.webp",
    // Wide recording: keep the prompt box in frame when the panel crops the sides.
    focus: "18% 50%",
    href: "https://github.com/Ryhox/Wieland-AI",
  },
  {
    title: "Pokyh",
    description: "WebUntis, reimagined: timetable, grades and the cafeteria menu in one installable app.",
    stack: "Next.js · PWA · Push notifications",
    video: "/work/pokyh.mp4",
    poster: "/work/pokyh.webp",
    href: "https://github.com/bedchem/pokyh-frontend",
  },
  {
    title: "Fruit Fly Slot Machine",
    description: "A real fruit-fly connectome, a stubborn little gambler, and a slot machine that never pays.",
    stack: "Connectome simulation · WebGL",
    video: "/work/fruitfly.mp4",
    poster: "/work/fruitfly.webp",
    href: "https://github.com/bedchem/fruit-fly-slot-machine",
  },
  {
    title: "Projectile Preview",
    description: "A client-side Fabric mod for Minecraft that shows where your projectiles will land before you shoot or throw.",
    stack: "Java · Fabric",
    video: "/work/projectile.mp4",
    poster: "/work/projectile.webp",
    href: "https://github.com/Ryhox/ProjectilePreview-Mod",
  },
];

export const socials = [
  { label: "GitHub", href: github.href },
  { label: "Email", href: "mailto:contact@ryhox.dev" },
  // No href: Discord handles are copied to the clipboard.
  { label: "Discord", handle: "ryhox" },
];
