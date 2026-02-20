import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import rehypeKatex from "rehype-katex";

import sitemap from "@astrojs/sitemap";

import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  site: "https://localhost:4321",
  integrations: [mdx(), sitemap()],
  markdown: {
    remarkPlugins: [remarkMath, remarkDirective],
    rehypePlugins: [rehypeKatex]
  },
  adapters: [
    vercel({
      imageService: true,
      isr: {
        expiration: 60 * 60 * 24
      },
      webAnalytics: {
        enabled: true
      }
    })
  ]
});
