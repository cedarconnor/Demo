import data from "../data/projects.json";

export interface Project {
  wixId: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  sourcePage: string;
  duration?: string;
  youtubeId: string;
}

export interface SiteData {
  site: {
    owner: string;
    email: string;
    resumePdf: string;
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
export const resumePdf = typed.site.resumePdf;
export const youtubeChannelUrl = typed.site.youtubeChannelUrl || "";
export const categories = typed.categories;

// Ordered list of category keys (drives nav order and home strips).
export const categoryKeys: string[] = Object.keys(categories);

// Only show videos that actually have a YouTube ID (all do, post-sync).
const isProd = import.meta.env.PROD;
export const allProjects: Project[] = typed.videos.filter(
  (p) => p.youtubeId && p.youtubeId.length > 0
);
export const liveProjects: Project[] = allProjects;

// Hero reel: configured by site.reelId, else the first "finals" piece.
const reelId = typed.site.reelId || "";
export const reel: Project | undefined =
  allProjects.find((p) => p.youtubeId === reelId) ||
  allProjects.find((p) => p.category === "finals") ||
  allProjects[0];

export function projectsByCategory(cat: string): Project[] {
  return liveProjects.filter(
    (p) => p.category === cat && (!reel || p.slug !== reel.slug)
  );
}

export function getProject(slug: string): Project | undefined {
  return allProjects.find((p) => p.slug === slug);
}

// Curated featured set comes from the synced data (site.featuredSlugs),
// falling back to the first handful of "finals" pieces.
export const featuredSlugs: string[] =
  typed.site.featuredSlugs && typed.site.featuredSlugs.length > 0
    ? typed.site.featuredSlugs
    : projectsByCategory("finals").slice(0, 8).map((p) => p.slug);

export const featuredProjects: Project[] = featuredSlugs
  .map((s) => allProjects.find((p) => p.slug === s))
  .filter((p): p is Project => Boolean(p))
  .filter((p) => !reel || p.slug !== reel.slug);
