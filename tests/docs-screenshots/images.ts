import { readFileSync } from "node:fs";

// The demo's architecture diagram, before and after the refunds branch adds a
// box: drawn once and committed, since nothing here draws images.
export const architecturePng = (withRefunds: boolean): Buffer =>
  readFileSync(
    new URL(
      `./assets/architecture-${withRefunds ? "after" : "before"}.png`,
      import.meta.url,
    ),
  );
