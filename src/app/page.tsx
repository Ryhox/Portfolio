import Experience from "@/components/Experience";
import RollText from "@/components/RollText";
import PlaygroundHint from "@/components/PlaygroundHint";
import CopyHandle from "@/components/CopyHandle";
import ProjectActions, { MediaFx } from "@/components/ProjectActions";
import { abilities, github, marquee, profile, projects, socials, tech } from "@/content";
import { FIGURES } from "@/components/three/constellations";

// Each word is its own element so it can light up as you scroll. "==words==" get a highlighter stroke.
function Statement({ text }: { text: string }) {
  const words: { word: string; mark: boolean; end: boolean }[] = [];
  let mark = false;
  for (const raw of text.split(" ")) {
    const opens = raw.startsWith("==");
    const closes = raw.endsWith("==");
    if (opens) mark = true;
    words.push({ word: raw.replaceAll("==", ""), mark, end: closes });
    if (closes) mark = false;
  }
  return (
    <p className="statement" data-words>
      {words.map(({ word, mark, end }, i) => (
        <span key={i} className={mark ? (end ? "w mark mark-end" : "w mark") : "w"}>
          {word}{" "}
        </span>
      ))}
    </p>
  );
}

// Per-letter masks for reveal animations, grouped by word so lines only break between words.
function Chars({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((word, w) => (
        <span key={w} className="word" aria-hidden>
          {Array.from(word).map((c, i) => (
            <span key={i} className="char-mask">
              <span className="char">{c}</span>
            </span>
          ))}
          {w < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

// What I do, as a Y2K music player: chrome buttons, and the words running across its little LCD screen
// like a track title (speed and direction follow the scroll). It really plays: pause it, or skip a word
// back / forward (see Motion.tsx).
function Ticker() {
  const items = [...marquee, ...marquee];
  return (
    <div className="ticker">
      <span className="tk-controls">
        <button type="button" className="tk-btn" data-tk="prev" aria-label="Back one word">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 5h2v14H6zM20 5v14l-10-7z" />
          </svg>
        </button>
        <button type="button" className="tk-btn is-play" data-tk="play" aria-label="Pause the ticker">
          <svg className="tk-pause" viewBox="0 0 24 24" aria-hidden>
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
          <svg className="tk-play" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button type="button" className="tk-btn" data-tk="next" aria-label="Forward one word">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M16 5h2v14h-2zM4 5v14l10-7z" />
          </svg>
        </button>
      </span>
      <span className="tk-lcd" aria-hidden>
        <span className="tk-label">
          <span className="tk-on">Now playing</span>
          <span className="tk-off">Paused</span>
        </span>
        <span className="ticker-window">
          <span className="ticker-inner">
            {[0, 1].map((copy) => (
              <span className="ticker-chunk" key={copy}>
                {items.map((m, i) => (
                  <span key={i} className="ticker-word">
                    {m}
                    <svg viewBox="0 0 20 20">
                      <path d="M10 0 Q11.6 8.4 20 10 Q11.6 11.6 10 20 Q8.4 11.6 0 10 Q8.4 8.4 10 0Z" />
                    </svg>
                  </span>
                ))}
              </span>
            ))}
          </span>
        </span>
      </span>
      <span className="tk-eq" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </span>
    </div>
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://ryhox.dev/#website",
      url: "https://ryhox.dev",
      name: "ryhox",
      description: "Portfolio of ryhox, a creative developer building playful 3D things for the web.",
      inLanguage: "en",
      publisher: { "@id": "https://ryhox.dev/#person" },
    },
    {
      "@type": "Person",
      "@id": "https://ryhox.dev/#person",
      name: "ryhox",
      url: "https://ryhox.dev",
      jobTitle: profile.role,
      sameAs: [github.href],
      knowsAbout: ["Three.js", "WebGL", "React Three Fiber", "GLSL", "Next.js", "React", "TypeScript", "JavaScript", "Node.js", "PostgreSQL", "MySQL", "Flutter", "Dart", "Java", "Kotlin", "C#", "Arduino", "GSAP", "Creative coding", "Minecraft modding"],
    },
    {
      "@type": "ItemList",
      name: "Selected work",
      itemListElement: projects.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "SoftwareSourceCode",
          name: p.title,
          description: p.description,
          codeRepository: p.links.source,
          ...(p.links.demo ? { url: p.links.demo } : {}),
          keywords: p.stack,
          author: { "@id": "https://ryhox.dev/#person" },
          image: `https://ryhox.dev${p.poster}`,
        },
      })),
    },
  ],
};

export default function Home() {
  return (
    <Experience>
      <script
        type="application/ld+json"
        // Escape "<" so the JSON can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <header className="nav">
        <a href="#top" className="nav-mark">
          <RollText text={profile.handle} />
        </a>
        <nav className="nav-links">
          <a href="#about" className="glass-pill">
            <RollText text="About" />
          </a>
          <a href="#work" className="glass-pill">
            <RollText text="Work" />
          </a>
          <a href="#contact" className="glass-pill">
            <RollText text="Contact" />
          </a>
        </nav>
      </header>

      <main>
        <section id="top" className="hero" data-section="hero">
          <div className="scroll-cue" aria-hidden>
            <span className="scroll-cue-text">
              {Array.from("Scroll to explore").map((c, i) => (
                <span key={i} className="cue-char" style={{ "--i": i } as React.CSSProperties}>
                  <span>{c === " " ? "\u00a0" : c}</span>
                  <span>{c === " " ? "\u00a0" : c}</span>
                </span>
              ))}
            </span>
            <span className="scroll-cue-line" />
          </div>
          <h1 className="sr-only">
            {profile.handle} — {profile.role}
          </h1>
        </section>

        {/* About: the statement, then night falls on a pinned sky where each ability is a constellation
            of its tools (WebGL, see AboutSky), and day comes back after. */}
        <section id="about" className="about" data-section="intro" aria-labelledby="about-title">
          <h2 id="about-title" className="sr-only">
            About
          </h2>
          <div className="about-intro">
            <Statement text={profile.statement} />
            <p className="about-kicker">
              <span>(About)</span>
              <span>{profile.note}</span>
            </p>
          </div>
          <Ticker />

          <div className="about-stage">
            <div className="ab-meta" aria-hidden>
              <span className="ab-name">
                <span className="ab-name-strip">
                  {abilities.map((a) => (
                    <span key={a.id}>{a.figure}</span>
                  ))}
                </span>
              </span>
              <span className="ab-count">
                <span className="ab-count-strip">
                  {abilities.map((a, i) => (
                    <span key={a.id}>{String(i + 1).padStart(2, "0")}</span>
                  ))}
                </span>
              </span>
              <span className="ab-of">/ {String(abilities.length).padStart(2, "0")}</span>
            </div>
            <ol className="ab-list">
              {abilities.map((a) => (
                <li key={a.id} className="ability">
                  <h3 className="ab-title">
                    <Chars text={a.title} />
                  </h3>
                  <p className="ab-line">{a.line}</p>
                  {/* The tools are drawn as the constellation's stars; this list is for screen readers. */}
                  <ul className="sr-only" aria-label={`${a.title}: tools`}>
                    {a.tools.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <p className="ab-proof">
                    <span>Seen in</span>
                    {a.proof.map((p) =>
                      p.project ? (
                        <a key={p.label} href={`#project-${p.project}`} data-goto={p.project}>
                          {p.label}
                        </a>
                      ) : (
                        <em key={p.label}>{p.label}</em>
                      ),
                    )}
                  </p>
                </li>
              ))}
            </ol>
            {/* Every star is a tool: hover the star (or its name) for what it is, click to visit it. */}
            <div className="sky-labels">
              {FIGURES.flatMap((f, fi) =>
                f.stars.map((st, si) => {
                  if (!st.label) return null;
                  const t = tech[st.label];
                  return (
                    <a
                      key={`${fi}-${si}`}
                      className={["sky-label", st.key ? "is-key" : "", st.lang ? "is-lang" : ""].filter(Boolean).join(" ")}
                      data-fig={fi}
                      data-star={si}
                      href={t?.url}
                      target="_blank"
                      rel="noreferrer"
                      tabIndex={-1}
                    >
                      {/* Sits right on the star (moved every frame by AboutSky). */}
                      <span className="sky-hit" />
                      <span className="sky-name">
                        {st.lang ? <i>&lt;/&gt;</i> : null}
                        {st.label}
                      </span>
                      {t ? (
                        <span className="sky-card">
                          <span className="sky-card-bar">
                            <i />
                            <i />
                            <i />
                            <span className="sky-card-title">{st.label}</span>
                          </span>
                          <span className="sky-card-info">{t.info}</span>
                          <span className="sky-card-url">
                            <svg viewBox="0 0 16 16" aria-hidden>
                              <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                            </svg>
                            <span className="sky-type">
                              {Array.from(t.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")).map((c, ci) => (
                                <span key={ci} style={{ "--i": ci } as React.CSSProperties}>
                                  {c}
                                </span>
                              ))}
                            </span>
                            <span className="sky-go">↗</span>
                          </span>
                        </span>
                      ) : null}
                    </a>
                  );
                }),
              )}
            </div>
          </div>

        </section>


        <section id="work" className="work" data-section="work">
          <div className="work-track">
            <div className="work-head">
              <h2 className="work-heading">
                <Chars text="Selected" />
                <br />
                <Chars text="work" />
              </h2>
              <p className="work-count">({String(projects.length).padStart(2, "0")})</p>
            </div>
            {projects.map((p, i) => (
              <article key={p.id} id={`project-${p.id}`} className="panel" data-project={p.id}>
                {/* The picture opens the main thing (the demo if there is one); the capsules below are the real buttons. */}
                <a
                  className="panel-media"
                  href={p.links.demo || p.links.source}
                  target="_blank"
                  rel="noreferrer"
                  tabIndex={-1}
                  aria-hidden
                >
                  {/* Loaded + played only near the viewport (see Motion.tsx); the poster paints instantly. */}
                  <video
                    className="panel-img"
                    data-src={p.video}
                    poster={p.poster}
                    muted
                    loop
                    playsInline
                    preload="none"
                    aria-label={`${p.title} preview`}
                    style={p.focus ? { objectPosition: p.focus } : undefined}
                  />
                  <MediaFx links={p.links} />
                </a>
                <div className="panel-info">
                  <span className="panel-index">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="panel-title">
                    <Chars text={p.title} />
                  </h3>
                  <p className="panel-desc">{p.description}</p>
                  <p className="panel-meta">{p.stack}</p>
                  <ProjectActions title={p.title} links={p.links} />
                </div>
              </article>
            ))}
            <a href={github.href} target="_blank" rel="noreferrer" className="panel-more" aria-label={`And much more on GitHub: ${github.handle}`}>
              <h3 className="more-title">
                <Chars text="And much" />
                <br />
                <Chars text="more" />
              </h3>
              <span className="more-link">
                <svg className="more-icon" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                  />
                </svg>
                <span className="more-handle">github.com/{github.handle}</span>
              </span>
            </a>
          </div>
        </section>

        <section id="contact" className="contact" data-section="contact">
          <h2 className="sayhi" aria-label="Say hi">
            <Chars text="Say" />
            <Chars text="hi" />
          </h2>
          <ul className="contact-links">
            {socials.map((s) => (
              <li key={s.label}>
                {"handle" in s && s.handle ? (
                  <CopyHandle label={s.label} handle={s.handle} />
                ) : (
                  <a
                    className="chrome-pill"
                    href={s.href}
                    target={s.href?.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    data-magnetic
                  >
                    <RollText text={s.label} />
                  </a>
                )}
              </li>
            ))}
          </ul>
          {/* The bubble garden: scroll past the links and there's a floor for the cat and the flowers. */}
          <div className="garden" aria-hidden />
          {/* The floor of the whole page: a meadow (ground in Backdrop.tsx, blades in stage/Grass.tsx). */}
          <div className="ground">
          <footer className="footer">
            <span>
              © {new Date().getFullYear()} {profile.handle}
            </span>
            <PlaygroundHint />
            <span>
              cat by{" "}
              <a href="https://sketchfab.com/3d-models/chonky-cat-trio-d9a2d94179384803af7456d633283496" target="_blank" rel="noreferrer">
                Kanna-Nakajima
              </a>{" "}
              · CC BY 4.0
            </span>
          </footer>
          </div>
        </section>
      </main>
    </Experience>
  );
}
