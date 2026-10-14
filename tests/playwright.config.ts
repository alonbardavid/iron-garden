import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // Must match the --persist-to directory tests/global-setup.ts seeds.
      // Teed to a file because e2e/logging/request-log.spec.ts reads what the
      // worker logged.
      command:
        "mkdir -p ../../tests/.logs && pnpm exec vite dev 2>&1 | tee ../../tests/.logs/worker.log",
      url: "http://localhost:8301/api/health",
      reuseExistingServer: !process.env.CI,
      cwd: "../apps/backend",
      env: { WORKER_PERSIST_TO: ".wrangler-test" },
      timeout: 120000,
    },
    {
      command: "pnpm dev:ci:frontend",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      cwd: "../",
      timeout: 60000,
    },
  ],
});
