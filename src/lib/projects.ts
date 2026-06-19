import data from "../data/projects.json";

export interface Project {
  slug: string;
  title: string;
  description: string;
  category: string;
  playlist?: string;
  duration?: string;
  youtubeId: string;
}

export interface SiteData {
  site: {
    owner: string;
    email: string;
    youtubeChannelUrl?: string;
    reelId?: string;
    featuredSlugs?: string[];
  };
  videos: Project[];
  categories: Record<string, string>;
}

const typed = data as SiteData;

export const owner = typed.site.owner;
export const email = typed.site.email;
export const youtubeChannelUrl = typed.site.youtubeChannelUrl || "";
export const categories = typed.categories;

// Ordered list of category keys — drives the playlist tabs in the nav and the
// per-playlist pages. Order follows the order in projects.json `categories`.
export const categoryKeys: string[] = Object.keys(categories);

// Only show videos that actually have a YouTube ID (all do, post-sync).
export const allProjects: Project[] = typed.videos.filter(
  (p) => p.youtubeId && p.youtubeId.length > 0
);

// Every video in a single playlist (no reel/featured special-casing — each
// playlist page lists all of its videos).
export function projectsByCategory(cat: string): Project[] {
  return allProjects.filter((p) => p.category === cat);
}

export function getProject(slug: string): Project | undefined {
  return allProjects.find((p) => p.slug === slug);
}
