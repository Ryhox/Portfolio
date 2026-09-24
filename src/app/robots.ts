import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://ryhox.dev/sitemap.xml",
    host: "https://ryhox.dev",
  };
}
