import { defineConfig } from "astro/config";

// Repo: https://github.com/cedarconnor/Demo => served at /Demo/
// If you later move to a user site (cedarconnor.github.io) or a custom
// domain, change `base` to "/" and update `site` accordingly.
export default defineConfig({
  site: "https://cedarconnor.github.io",
  base: "/Demo/",
  trailingSlash: "ignore",
  build: {
    assets: "_astro",
  },
});
