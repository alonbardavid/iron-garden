import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const persistTo = process.env.WORKER_PERSIST_TO;
// Artifacts has no local simulator: with a namespace set, local dev and e2e
// bind the real service (wrangler login or CLOUDFLARE_API_TOKEN with
// Artifacts: Edit). Without it git hosting is off.
const artifactsNamespace = process.env.ARTIFACTS_NAMESPACE;
// Workers AI has no local simulator either: WORKERS_AI=true binds the real
// service (wrangler login, or CLOUDFLARE_API_TOKEN with Workers AI: Read).
// Without it server-side processing is off.
const workersAi = process.env.WORKERS_AI === "true";

export default defineConfig({
  plugins: [
    cloudflare({
      // Pins the output to dist/worker. Without it the dir is named after the
      // worker in wrangler.jsonc, and every deploy path would depend on it.
      viteEnvironment: { name: "worker" },
      persistState: persistTo ? { path: persistTo } : true,
      config: {
        ...(artifactsNamespace && {
          artifacts: [
            {
              binding: "ARTIFACTS",
              namespace: artifactsNamespace,
              remote: true,
            },
          ],
        }),
        ...(workersAi && { ai: { binding: "AI", remote: true } }),
      },
    }),
    processingSandbox(),
  ],
  resolve: {
    alias: {
      // @react-email/render's workerd build imports react-dom/server.edge,
      // which react-dom 18 does not export; rollup fails the build without
      // this alias. server.browser is the same Web-Streams build. Drop on React 19.
      "react-dom/server.edge": "react-dom/server.browser",
    },
  },
  server: {
    // Both frontend dev servers proxy /api to this port.
    port: 8301,
    strictPort: true,
  },
});

// `virtual:processing-sandbox`: the code the Worker Loader runs for
// server-side processing, as a SandboxCode (@lib/ai). Each file of the
// sandbox folder becomes one module, compiled but not bundled, so the folder
// may import only its siblings and cloudflare:workers. The name carries a
// hash of the code, so a deploy never reuses a Worker loaded from older code.
function processingSandbox(): Plugin {
  const id = "virtual:processing-sandbox";
  const dir = fileURLToPath(
    new URL("../../libs/review/src/processing/sandbox", import.meta.url),
  );
  return {
    name: "processing-sandbox",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    async load(resolved) {
      if (resolved !== `\0${id}`) {
        return null;
      }
      const modules: Record<string, string> = {};
      const files = readdirSync(dir).filter(
        (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
      );
      for (const file of files) {
        const path = join(dir, file);
        this.addWatchFile(path);
        const { code } = await transformWithEsbuild(
          readFileSync(path, "utf8"),
          path,
          { format: "esm", target: "es2022" },
        );
        modules[file.replace(/\.ts$/, ".js")] = code;
      }
      const hash = createHash("sha256")
        .update(JSON.stringify(modules))
        .digest("hex")
        .slice(0, 16);
      const code = {
        name: `processing-${hash}`,
        mainModule: "entry.js",
        modules,
      };
      return `export default ${JSON.stringify(code)};`;
    },
  };
}
