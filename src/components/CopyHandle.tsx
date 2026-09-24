"use client";

import { useState } from "react";
import RollText from "./RollText";

// Discord has no public profile URL by username, so this copies the handle instead.
export default function CopyHandle({ label, handle }: { label: string; handle: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handle);
    } catch {
      // Clipboard can be blocked; the label still shows the handle so it can be typed.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button type="button" className="copy-handle" onClick={copy} data-magnetic aria-label={`${label}: ${handle} (copy to clipboard)`}>
      <RollText text={copied ? `@${handle} copied ✧` : label} />
    </button>
  );
}
