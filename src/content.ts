import { links, type ProjectLinks } from "./links";

export const profile = {
  handle: "ryhox",
  role: "Creative developer",
  // The About headline; the rest of the old statement became the constellations below.
  statement: "I build ==playful, tactile== things for the web.",
  note: "Open for freelance, collabs and weird ideas.",
};

export const marquee = ["Creative developer", "Three.js", "WebGL", "Apps", "Interfaces", "Experiments"];

export const github = { handle: "Ryhox", href: links.github };

export type ProjectId = keyof typeof links.projects;

type Project = {
  id: ProjectId;
  title: string;
  description: string;
  stack: string;
  video: string;
  poster: string;
  focus?: string;
  links: ProjectLinks;
};

// Clips are pre-encoded small (H.264, 1120px, no audio, faststart) with a WebP poster for instant paint.
export const projects: Project[] = [
  {
    id: "stargazer",
    title: "Stargazer Islands",
    description: "An explorable Three.js island world. Star the repo and you get your own island in it.",
    stack: "Three.js · React Three Fiber · GLSL",
    video: "/work/stargazer.mp4",
    poster: "/work/stargazer.webp",
    links: links.projects.stargazer,
  },
  {
    id: "wieland",
    title: "Wieland AI",
    description: "A locally hosted AI assistant running on Ollama. Private, fast, no cloud required.",
    stack: "JavaScript · Ollama",
    video: "/work/wieland.mp4",
    poster: "/work/wieland.webp",
    // Wide recording: keep the prompt box in frame when the panel crops the sides.
    focus: "18% 50%",
    links: links.projects.wieland,
  },
  {
    id: "pokyh",
    title: "Pokyh",
    description: "WebUntis, reimagined: timetable, grades and the cafeteria menu in one installable app.",
    stack: "Next.js · PWA · Push notifications",
    video: "/work/pokyh.mp4",
    poster: "/work/pokyh.webp",
    links: links.projects.pokyh,
  },
  {
    id: "flylab",
    title: "Fly Lab",
    description: "A real fruit-fly connectome, a stubborn little gambler, and a slot machine that never pays.",
    stack: "Connectome simulation · WebGL",
    video: "/work/flylab.mp4",
    poster: "/work/flylab.webp",
    links: links.projects.flylab,
  },
  {
    id: "projectile",
    title: "Projectile Preview",
    description: "A client-side Fabric mod for Minecraft that shows where your projectiles will land before you shoot or throw.",
    stack: "Java · Fabric",
    video: "/work/projectile.mp4",
    poster: "/work/projectile.webp",
    links: links.projects.projectile,
  },
];

// The About section: one constellation per ability (drawn in components/three/constellations.ts).
// `figure` names what the stars draw, `tools` label its brightest stars, `proof` points at the work.
export type Ability = {
  id: "worlds" | "apps" | "ai" | "mods" | "motion";
  title: string;
  line: string;
  tools: string[];
  proof: { label: string; project?: ProjectId }[];
  figure: string;
};

export const abilities: Ability[] = [
  {
    id: "worlds",
    title: "3D worlds",
    line: "Explorable, real-time scenes that run in a browser tab. Floating islands, liquid glass letters, a cat rigged entirely in a shader.",
    tools: ["Three.js", "React Three Fiber", "GLSL", "WebGL"],
    proof: [{ label: "Stargazer Islands", project: "stargazer" }, { label: "this site" }],
    figure: "The cube",
  },
  {
    id: "apps",
    title: "Everyday apps",
    line: "Apps people open every day, on the web and on phones: timetables, grades and the cafeteria menu, with push notifications that actually arrive.",
    tools: ["Next.js", "React", "TypeScript", "Flutter"],
    proof: [{ label: "Pokyh", project: "pokyh" }],
    figure: "The flip phone",
  },
  {
    id: "ai",
    title: "AI & backends",
    line: "Private AI that runs on your own machine, the servers and databases behind the apps, and a simulated fruit-fly brain with a gambling problem.",
    tools: ["Ollama", "Node.js", "PostgreSQL", "MySQL", "JavaScript"],
    proof: [{ label: "Wieland AI", project: "wieland" }, { label: "Fly Lab", project: "flylab" }],
    figure: "The network",
  },
  {
    id: "mods",
    title: "Mods & hardware",
    line: "Minecraft mods that bend the rules a little, and C# and Arduino for the things that don't live in a browser.",
    tools: ["Java", "Kotlin", "C#", "Arduino", "Fabric"],
    proof: [{ label: "Projectile Preview", project: "projectile" }],
    figure: "The pickaxe",
  },
  {
    id: "motion",
    title: "Motion & feel",
    line: "Scroll choreography, physics and tiny interactions that make an interface feel like a toy. You are scrolling through one.",
    tools: ["GSAP", "ScrollTrigger", "Lenis"],
    proof: [{ label: "this site" }],
    figure: "The paper plane",
  },
];

export const socials = [
  { label: "GitHub", href: links.github },
  { label: "Email", href: links.email },
  // No href: Discord handles are copied to the clipboard.
  { label: "Discord", handle: links.discord },
];

// Hover cards on the constellation stars: what each tool is, and where it lives.
export const tech: Record<string, { info: string; url: string }> = {
  "Three.js": { info: "The 3D engine of the web: scenes, lights, materials, shaders.", url: "https://threejs.org" },
  "React Three Fiber": { info: "Three.js written as React components.", url: "https://r3f.docs.pmnd.rs" },
  GLSL: { info: "The shading language: little programs that run on the GPU for every pixel.", url: "https://www.khronos.org/opengl/wiki/Core_Language_(GLSL)" },
  WebGL: { info: "The browser's direct line to the graphics card.", url: "https://www.khronos.org/webgl/" },
  "Next.js": { info: "The React framework for fast, server-rendered, installable web apps.", url: "https://nextjs.org" },
  React: { info: "A library for building interfaces out of components.", url: "https://react.dev" },
  TypeScript: { info: "JavaScript with types that catch mistakes before they ship.", url: "https://www.typescriptlang.org" },
  Flutter: { info: "One Dart codebase, native apps for phones and more.", url: "https://flutter.dev" },
  Ollama: { info: "Runs large language models on your own machine.", url: "https://ollama.com" },
  "Node.js": { info: "JavaScript on the server: APIs, tools and scripts.", url: "https://nodejs.org" },
  PostgreSQL: { info: "A powerful open-source relational database.", url: "https://www.postgresql.org" },
  MySQL: { info: "The classic open-source relational database.", url: "https://www.mysql.com" },
  JavaScript: { info: "The language every browser speaks.", url: "https://developer.mozilla.org/docs/Web/JavaScript" },
  Java: { info: "The JVM language Minecraft and its mods are built in.", url: "https://dev.java" },
  Kotlin: { info: "A modern, concise language for the JVM and Android.", url: "https://kotlinlang.org" },
  "C#": { info: "Microsoft's language for apps, tools and games on .NET.", url: "https://learn.microsoft.com/dotnet/csharp/" },
  Arduino: { info: "Small programmable boards for things that blink, beep and move.", url: "https://www.arduino.cc" },
  Fabric: { info: "A lightweight toolchain for modding Minecraft.", url: "https://fabricmc.net" },
  GSAP: { info: "A professional-grade animation engine for the web.", url: "https://gsap.com" },
  ScrollTrigger: { info: "GSAP's plugin for animations driven by the scroll.", url: "https://gsap.com/docs/v3/Plugins/ScrollTrigger/" },
  Lenis: { info: "Smooth scrolling that stays in sync with everything else.", url: "https://lenis.darkroom.engineering" },
};
