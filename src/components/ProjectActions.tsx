import type { CSSProperties } from "react";
import { hasDemo, type ProjectLinks } from "@/links";

// "Live demo" + "Source code" for a project (behaviour in ActionFx.tsx). A flat fill floods in from
// the exact point the pointer enters and drains out where it leaves; the label is drawn twice so it
// changes colour precisely at the edge of the fill.

function Roll({ text }: { text: string }) {
  return (
    <span className="act-text">
      {Array.from(text).map((c, i) => {
        const ch = c === " " ? " " : c;
        return (
          <span key={i} className="act-ch" style={{ "--i": i } as CSSProperties}>
            <span>{ch}</span>
            <span>{ch}</span>
          </span>
        );
      })}
    </span>
  );
}

function Arrow() {
  return (
    <span className="act-arrow">
      {[0, 1].map((k) => (
        <svg key={k} viewBox="0 0 24 24" aria-hidden>
          <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

function Brackets() {
  return (
    <span className="act-code" aria-hidden>
      <span className="act-code-l">&lt;</span>
      <span className="act-code-s">/</span>
      <span className="act-code-r">&gt;</span>
    </span>
  );
}

function Row({ label, code, arrow = true, wet }: { label: string; code?: boolean; arrow?: boolean; wet?: boolean }) {
  return (
    <span className={wet ? "act-row act-wet" : "act-row"} aria-hidden>
      {code ? <Brackets /> : null}
      <Roll text={label} />
      {arrow ? <Arrow /> : null}
    </span>
  );
}

const typed = (text: string) =>
  Array.from(text).map((c, i) => (
    <span key={i} style={{ "--i": i } as CSSProperties}>
      {c}
    </span>
  ));

// What the buttons do to the project picture: "Live demo" turns it into a browser window loading the
// real URL; "Source code" decodes the running video into characters (canvas, see ActionFx); no demo
// gets stamped.
export function MediaFx({ links }: { links: ProjectLinks }) {
  const host = links.demo ? links.demo.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
  const repo = links.source.replace(/^https?:\/\//, "");
  return (
    <>
      {host ? (
        <span className="mfx-browser" aria-hidden>
          <span className="mfx-bar">
            <i />
            <i />
            <i />
            <span className="mfx-url">
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <span className="mfx-type">{typed(host)}</span>
              <span className="mfx-caret" />
            </span>
          </span>
          <span className="mfx-load" />
        </span>
      ) : (
        <span className="mfx-stamp" aria-hidden>
          <span>No live demo</span>
          {links.elsewhere ? <small>{links.elsewhere.note}</small> : null}
        </span>
      )}
      <canvas className="mfx-ascii" aria-hidden />
      <span className="mfx-repo" aria-hidden>
        <span className="mfx-type">{typed(repo)}</span>
        <span className="mfx-caret" />
      </span>
    </>
  );
}

export default function ProjectActions({ title, links }: { title: string; links: ProjectLinks }) {
  const demo = hasDemo(links);
  return (
    <div className="panel-actions">
      {demo ? (
        <a className="act act--solid" href={links.demo} target="_blank" rel="noreferrer" data-act aria-label={`Live demo of ${title} (opens in a new tab)`}>
          <span className="act-fill" aria-hidden />
          <Row label="Live demo" />
          <Row label="Live demo" wet />
        </a>
      ) : (
        <span className="act act--none" tabIndex={0} role="note" aria-label={`${title} has no live demo.${links.elsewhere ? ` ${links.elsewhere.note}.` : ""}`}>
          <Row label="No live demo" arrow={false} />
        </span>
      )}
      <a className="act act--line" href={links.source} target="_blank" rel="noreferrer" data-act aria-label={`Source code of ${title} on GitHub (opens in a new tab)`}>
        <span className="act-fill" aria-hidden />
        <Row label="Source code" code />
        <Row label="Source code" code wet />
      </a>
      {!demo && links.elsewhere ? (
        <p className="act-note">
          {links.elsewhere.note} —{" "}
          <a href={links.elsewhere.href} target="_blank" rel="noreferrer">
            {links.elsewhere.label}
          </a>
        </p>
      ) : null}
    </div>
  );
}
