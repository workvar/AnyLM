import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = ["", "/download", "/releases", "/privacy"];

  return paths.map((path) => ({
    url: `${SITE_URL}${path || "/"}`,
    lastModified: now,
    changeFrequency: path === "" || path === "/download" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/download" ? 0.9 : 0.6,
  }));
}
