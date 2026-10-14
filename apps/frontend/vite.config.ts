import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";

// The app title is filled at BUILD time (works in dev serve too) — no runtime
// document.title assignment.
const productNameHtml: PluginOption = {
  name: "html-product-name",
  transformIndexHtml(html) {
    return html.replace(/%PRODUCT_NAME%/g, PRODUCT_DISPLAY_NAME);
  },
};

export default defineConfig({
  plugins: [react(), productNameHtml],
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // ws: agents may hold their chat socket open through this server too.
      "/api": { target: "http://localhost:8301", ws: true },
      "^/[a-z0-9-]+\\.git/": "http://localhost:8301",
    },
  },
});
