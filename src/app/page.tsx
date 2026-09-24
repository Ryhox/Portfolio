import Experience from "@/components/Experience";
import RollText from "@/components/RollText";
import PlaygroundHint from "@/components/PlaygroundHint";
import CopyHandle from "@/components/CopyHandle";
import { github, marquee, profile, projects, socials } from "@/content";

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

function MarqueeRow({ reverse }: { reverse?: boolean }) {
  const items = [...marquee, ...marquee];
  return (
    <div className={reverse ? "marquee-row is-reverse" : "marquee-row"} aria-hidden>
      <div className="marquee-inner">
        {[0, 1].map((copy) => (
          <span className="marquee-chunk" key={copy}>
            {items.map((m, i) => (
              <span key={i} className="marquee-word">
                {m}
                <svg className="marquee-star" viewBox="0 0 20 20" aria-hidden>
                  <path d="M10 0 Q11.6 8.4 20 10 Q11.6 11.6 10 20 Q8.4 11.6 0 10 Q8.4 8.4 10 0Z" />
                </svg>
              </span>
            ))}
          </span>
        ))}
      </div>
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
      knowsAbout: ["Three.js", "WebGL", "React Three Fiber", "Next.js", "TypeScript", "Creative coding", "Minecraft modding"],
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
          codeRepository: p.href,
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
          <a href="#about">
            <RollText text="About" />
          </a>
          <a href="#work">
            <RollText text="Work" />
          </a>
          <a href="#contact">
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

        <section id="about" className="intro" data-section="intro">
          <Statement text={profile.statement} />
          <p className="intro-note">{profile.note}</p>
        </section>

        <section className="marquee" data-section="marquee">
          <MarqueeRow />
          <MarqueeRow reverse />
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
              <a
                key={p.title}
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="panel"
              >
                <div className="panel-media">
                  {/* Loaded + played only near the viewport (see Motion.tsx); the poster paints instantly. */}
                  <video
                    className="panel-img"
                    data-src={p.video}
                    poster={p.poster}
                    muted
                    loop
                    playsInline
                    preload="none"
                    aria-label={p.title}
                    style={"focus" in p ? { objectPosition: p.focus } : undefined}
                  />
                  <span className="panel-go" aria-hidden>
                    <svg viewBox="0 0 24 24" width="22" height="22">
                      <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
                <div className="panel-info">
                  <span className="panel-index">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="panel-title">
                    <Chars text={p.title} />
                  </h3>
                  <p className="panel-desc">{p.description}</p>
                  <p className="panel-meta">{p.stack}</p>
                </div>
              </a>
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
        </section>
      </main>
    </Experience>
  );
}
