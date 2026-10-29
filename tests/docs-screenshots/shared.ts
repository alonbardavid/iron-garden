import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";

export const MAYA = {
  username: "maya",
  name: "Maya Chen",
  email: "maya@acme.dev",
  password: "garden-demo-password-1",
};
export const SAM = {
  username: "sam",
  name: "Sam Ortiz",
  email: "sam@acme.dev",
  password: "garden-demo-password-2",
};
export const REPOSITORY = "billing-api";

// What the scenario made that only the API knows, for the capture spec.
export interface Demo {
  agentKey: string;
  chat: { messagesUrl: string };
}

const here = dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = resolve(here, "../../apps/backend");
// The instance's local state, relative to the backend.
export const PERSIST = ".wrangler-docs";
const DEMO_FILE = resolve(here, "../test-results/docs-demo.json");
const SCREENSHOTS = resolve(here, "../../apps/docs/src/assets/screenshots");

export function saveDemo(demo: Demo) {
  mkdirSync(dirname(DEMO_FILE), { recursive: true });
  writeFileSync(DEMO_FILE, JSON.stringify(demo, null, 2));
}

export function loadDemo(): Demo {
  return JSON.parse(readFileSync(DEMO_FILE, "utf8")) as Demo;
}

// A screenshot for the docs: the viewport, the whole page, its top `height`
// pixels, or one part of it.
export async function shot(
  target: Page | Locator,
  name: string,
  { fullPage = false, height }: { fullPage?: boolean; height?: number } = {},
) {
  mkdirSync(SCREENSHOTS, { recursive: true });
  // Mantine's transitions run in script, which `animations: "disabled"` does
  // not stop; let a dialog or menu finish opening.
  await ("goto" in target ? target : target.page()).waitForTimeout(400);
  const options = {
    path: resolve(SCREENSHOTS, `${name}.png`),
    animations: "disabled" as const,
  };
  if (!("goto" in target)) return target.screenshot(options);
  const clip = height
    ? { x: 0, y: 0, width: target.viewportSize()!.width, height }
    : undefined;
  await target.screenshot({ ...options, fullPage, clip });
}

// The dev server's first requests can stall while it bundles, leaving the app
// on its loading screen; reload until the app has started: its header, or
// the form a signed-out visitor sees.
export async function openApp(page: Page, path = "/") {
  await expect(async () => {
    await page.goto(path);
    await expect(
      page.locator("header").or(page.locator("form")).first(),
    ).toBeVisible({
      timeout: 10_000,
    });
  }).toPass({ timeout: 90_000 });
}
