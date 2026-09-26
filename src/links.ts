// Every outbound URL on the site, in one place.
//
// Projects: `demo` opens the live thing, `source` the code. `demo: null` shows the designed
// "no live demo" capsule instead (optionally with an `elsewhere` link, e.g. a mod page).
// An empty string counts as "not filled in yet" and also falls back to the no-demo state.
//
// Demo URLs were taken from each repo's GitHub "homepage" field (all answered 200 on 2026-09-26).

export type ProjectLinks = {
  demo: string | null;
  source: string;
  // Shown under the no-demo capsule: where the project actually lives.
  elsewhere?: { label: string; href: string; note: string };
};

export const links = {
  github: "https://github.com/Ryhox",
  email: "mailto:contact@ryhox.dev",
  // Discord has no public profile URL by username: the handle is copied to the clipboard.
  discord: "ryhox",

  projects: {
    stargazer: {
      demo: "https://threejs.ryhox.dev",
      source: "https://github.com/Ryhox/Stargazer-Islands",
    },
    wieland: {
      demo: "https://ai.ryhox.dev",
      source: "https://github.com/Ryhox/Wieland-AI",
    },
    pokyh: {
      demo: "https://pokyh.com",
      source: "https://github.com/bedchem/pokyh-frontend",
    },
    flylab: {
      demo: "https://fly.pokyh.com",
      source: "https://github.com/bedchem/fruit-fly-slot-machine",
    },
    projectile: {
      demo: null,
      source: "https://github.com/Ryhox/ProjectilePreview-Mod",
      elsewhere: {
        note: "It runs inside Minecraft",
        label: "Get it on Modrinth",
        href: "https://modrinth.com/mod/projectile.preview",
      },
    },
  } satisfies Record<string, ProjectLinks>,
} as const;

export const hasDemo = (p: ProjectLinks): p is ProjectLinks & { demo: string } => !!p.demo;
