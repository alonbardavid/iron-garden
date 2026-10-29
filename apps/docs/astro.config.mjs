import { defineConfig, passthroughImageService } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";
import { DOCS_PATH, PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";
import { remarkBaseLinks, remarkProductName } from "./src/remark-plugins.mjs";
import { rehypeTableLayout } from "./src/rehype-plugins.mjs";

// Every link and asset URL in the build starts with its base, so the build
// must know where it will be served: the app's DOCS_PATH by default, or the
// full address of a standalone site, such as GitHub Pages, in DOCS_URL
// (https://<owner>.github.io/<repo>/).
const standalone = process.env.DOCS_URL
  ? new URL(process.env.DOCS_URL)
  : undefined;
const base = standalone?.pathname ?? DOCS_PATH;

export default defineConfig({
  site: standalone?.origin,
  base,
  // Pages are folders (users/index.html), which both Workers static assets
  // and GitHub Pages serve at users/.
  trailingSlash: "always",
  // Screenshots are served as captured, so a reader can open them at full
  // size, and there is no need for sharp.
  image: { service: passthroughImageService() },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkProductName, remarkBaseLinks({ base })],
      rehypePlugins: [rehypeTableLayout],
    }),
  },
  integrations: [
    starlight({
      title: PRODUCT_DISPLAY_NAME,
      components: {
        MarkdownContent: "./src/components/MarkdownContent.astro",
        SiteTitle: "./src/components/SiteTitle.astro",
      },
      favicon: "/favicon.svg",
      customCss: [
        "@fontsource/ibm-plex-sans/400.css",
        "@fontsource/ibm-plex-sans/600.css",
        "@fontsource/ibm-plex-mono/400.css",
        "./src/styles/theme.css",
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/alonbardavid/iron-garden",
        },
      ],
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "Introduction", slug: "index" },
            {
              label: "Installation",
              items: [
                "getting-started/installation/quick-start",
                "getting-started/installation/manual",
                "getting-started/installation/initial-setup",
              ],
            },
            "getting-started/first-run",
          ],
        },
        {
          label: "Agent workflows",
          items: [
            "agent-workflows/agents-and-sessions",
            "agent-workflows/prompting-your-agent",
            "agent-workflows/transcripts",
            "agent-workflows/pull-request-processing",
            "agent-workflows/live-connection",
          ],
        },
        {
          label: "Code review",
          items: [
            "code-review/lines-and-chunks",
            "code-review/accepting-changes",
            "code-review/files-view",
            "code-review/brackets",
            "code-review/chunk-context",
            "code-review/confidence-levels",
            "code-review/agent-chat",
          ],
        },
        {
          label: "Capabilities",
          items: ["capabilities/github-integration"],
        },
        {
          label: "Administration",
          items: [
            "administration/server-agent-setup",
            "administration/prompt-customization",
            "administration/email",
            "administration/github-setup",
            "administration/rules",
            "administration/monitoring-and-logs",
          ],
        },
        {
          label: "Customization",
          items: [
            "customization/custom-domain",
            "customization/pulling-from-origin",
            "customization/developing-with-staging",
            "customization/working-with-edge-stack",
          ],
        },
        {
          label: "API",
          items: [
            "api/overview",
            {
              label: "Agent API",
              items: [
                "api/agent/sessions",
                "api/agent/pull-requests",
                "api/agent/transcripts",
                "api/agent/chat",
              ],
            },
            {
              label: "User API",
              items: [
                "api/user/sessions",
                "api/user/pull-requests",
                "api/user/reviews",
                "api/user/chat",
                "api/user/agents-and-keys",
                "api/user/repositories",
              ],
            },
          ],
        },
      ],
      plugins: [starlightLinksValidator()],
    }),
  ],
});
