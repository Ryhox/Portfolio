import type { Metadata } from "next";
import Link from "next/link";
import RollText from "@/components/RollText";

export const metadata: Metadata = {
  title: "404",
  description: "This page popped like a soap bubble.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="nf">
      <Link href="/" className="nf-mark">
        ryhox
      </Link>
      <h1 className="nf-code">
        404<span className="sr-only"> — page not found</span>
      </h1>
      <p className="nf-title">This page popped.</p>
      <p className="nf-sub">Like a soap bubble, it was here a second ago.</p>
      <Link href="/" className="nf-home">
        <RollText text="Back to the start" />
      </Link>
    </main>
  );
}
