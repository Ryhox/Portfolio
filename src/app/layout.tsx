import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Fredoka, Manrope } from "next/font/google";
import { preload } from "react-dom";
import "lenis/dist/lenis.css";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const bubble = Fredoka({
  variable: "--font-bubble",
  subsets: ["latin"],
  weight: "700",
});

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const SITE = "https://ryhox.dev";
const TITLE = "✧ Portfolio ✧ ryhox.dev";
const DESCRIPTION =
  "ryhox is a creative developer building playful, tactile things for the web: interactive Three.js worlds, WebGL experiments, apps people use every day and Minecraft mods. Bubbles and a chonky cat included.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s ✧ ryhox" },
  description: DESCRIPTION,
  applicationName: "ryhox",
  authors: [{ name: "ryhox", url: "https://github.com/Ryhox" }],
  creator: "ryhox",
  publisher: "ryhox",
  keywords: [
    "ryhox",
    "creative developer",
    "creative coding",
    "three.js portfolio",
    "3d portfolio",
    "webgl",
    "react three fiber",
    "next.js",
    "interactive website",
    "y2k design",
    "frontend developer",
    "web developer portfolio",
    "stargazer islands",
    "fabric minecraft mod",
    "ollama",
  ],
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ryhox",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-video-preview": -1, "max-snippet": -1 },
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#0f0b1e",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Start fetching the 3D models with the HTML instead of after the JS has booted.
  preload("/models/letters.glb", { as: "fetch", crossOrigin: "anonymous" });
  preload("/models/cat.glb", { as: "fetch", crossOrigin: "anonymous" });
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${bubble.variable}`}>
      <body>{children}</body>
    </html>
  );
}
