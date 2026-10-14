import { defineConfig } from "vitest/config";

// Unit tests for pure modules: nothing here may import cloudflare:workers.
// Anything that needs a binding is covered by the e2e suite in tests/.
export default defineConfig({
  test: {
    include: ["libs/*/src/**/*.test.ts", "apps/frontend/src/**/*.test.ts"],
  },
});
