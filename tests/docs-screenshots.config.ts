import { defineConfig, devices } from "@playwright/test";

// Screenshots for the operating docs (apps/docs), taken from a fresh local
// instance seeded with a demo: `pnpm --filter tests docs:screenshots` after
// `pnpm build`. Needs no Cloudflare account. Not part of the e2e suite.
// DOCS_SCREENSHOTS_KEEP=1 keeps the last run's demo, to retake screenshots
// with `… docs:screenshots 2-capture`.
export default defineConfig({
  testDir: "./docs-screenshots",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 120_000,
  globalSetup: "./docs-screenshots/global-setup.ts",
  // Through the frontend dev server, the origin sign-in trusts locally.
  use: { baseURL: "http://localhost:5173", actionTimeout: 15_000 },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: "light",
      },
    },
  ],
  webServer: [
    {
      command: "pnpm exec vite dev",
      url: "http://localhost:8301/api/health",
      reuseExistingServer: true,
      cwd: "../apps/backend",
      env: { WORKER_PERSIST_TO: ".wrangler-docs" },
      timeout: 120_000,
    },
    {
      command: "pnpm dev:ci:frontend",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      cwd: "../",
      timeout: 60_000,
    },
  ],
});
