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
    wixUrl: string;
    siteId: string;
    owner: string;
    email: string;
    resumePdf: string;
    olderResumes: string[];
    pages: string[];
  };
  videos: Project[];
  categories: Record<string, string>;
}

const typed = data as SiteData;

export const owner = typed.site.owner;
export const email = typed.site.email;
export const resumePdf = typed.site.resumePdf;
export const categories = typed.categories;

// Filter out projects without a YouTube ID for prod views, but keep them
// listed in dev so the user can see the placeholders.
const isProd = import.meta.env.PROD;
export const allProjects: Project[] = typed.videos;
export const liveProjects: Project[] = isProd
  ? typed.videos.filter((p) => p.youtubeId && p.youtubeId.length > 0)
  : typed.videos;

export const reel: Project | undefined = allProjects.find((p) => p.category === "reel");

export function projectsByCategory(cat: string): Project[] {
  return liveProjects.filter((p) => p.category === cat && p.category !== "reel");
}

export function getProject(slug: string): Project | undefined {
  return allProjects.find((p) => p.slug === slug);
}

// Curated featured set. Edit this array to surface your strongest work
// at the top of the home page.
export const featuredSlugs = [
  "demo-reel-hero",
  "ai-projection-mapping",
  "comfyui-cloud-api",
  "quest-dome",
  "snoop-fluids",
  "griffith-snow-timelapse",
  "kelp-forest",
  "midi-comfyui",
  "facepoke",
];

export const featuredProjects: Project[] = featuredSlugs
  .map((s) => allProjects.find((p) => p.slug === s))
  .filter((p): p is Project => Boolean(p));
