// Helper for prepending Astro's base path (e.g. "/Demo") to internal links.
// Astro auto-prefixes asset URLs but NOT manually written <a href="..."> targets,
// so we use this helper everywhere we link between pages.

const RAW = import.meta.env.BASE_URL || "/";
export const BASE = RAW.replace(/\/$/, ""); // "/Demo" or ""

export function url(path: string): string {
  if (!path.startsWith("/")) path = "/" + path;
  return `${BASE}${path}`;
}
