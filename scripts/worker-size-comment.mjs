#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const ONE_MIB = 1024 * 1024;
// Cloudflare rejects an asset file larger than this, whatever the plan.
const MAX_ASSET_FILE_MIB = 25;
// Warn once the gzipped script is this close to the plan's script-size limit.
const LIMIT_WARN_PCT = 80;
// Built from a string so the escape character stays out of the source file.
// eslint-disable-next-line no-control-regex
const ANSI_CODES = new RegExp("\\u001b\\[[0-9;]*m", "g");

// Renders the worker size section of the preview PR comment. The size is not
// measured here — it is parsed out of the log wrangler already wrote while
// uploading, so no second bundling pass is needed. With --json it emits the raw
// numbers instead, which is how a main build records a baseline to compare against.
function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const logPath = args.find((arg) => !arg.startsWith("--"));
  if (!logPath) {
    console.error("Usage: worker-size-comment.mjs <wrangler-log> [--json]");
    process.exit(1);
  }

  const bundle = parseBundleSize(readFileSync(logPath, "utf8"));

  if (asJson) {
    if (!bundle) {
      console.error(
        `No "Total Upload" line in ${logPath} — refusing to write a baseline`,
      );
      process.exit(1);
    }
    console.log(JSON.stringify(bundle));
    return;
  }

  const limitMib = Number(requireEnv("WORKER_SIZE_LIMIT_MIB"));
  if (!Number.isFinite(limitMib) || limitMib <= 0) {
    console.error(
      `WORKER_SIZE_LIMIT_MIB must be a positive number, got "${process.env.WORKER_SIZE_LIMIT_MIB}"`,
    );
    process.exit(1);
  }
  const growthWarnPct = Number(process.env.WORKER_SIZE_GROWTH_WARN_PCT ?? 20);
  const assets = measureAssets(
    // measureAssets reports zero for a missing directory, so a wrong path
    // silently under-reports instead of failing.
    resolve(root, process.env.ASSETS_DIR ?? "apps/backend/dist/client"),
  );
  const baseline = readBaseline(process.env.BASELINE_FILE);

  const warnings = [];
  const lines = [];

  if (bundle) {
    const usedPct = (bundle.gzipKiB / 1024 / limitMib) * 100;
    const growth = baseline
      ? ((bundle.gzipKiB - baseline.gzipKiB) / baseline.gzipKiB) * 100
      : null;
    const vsMain = growth === null ? "" : `, ${signed(growth)}% vs main`;
    lines.push(
      `- Worker bundle: ${bundle.rawKiB} KiB (gzip: ${bundle.gzipKiB} KiB) — ${usedPct.toFixed(1)}% of the ${limitMib} MiB limit${vsMain}`,
    );
    if (usedPct >= LIMIT_WARN_PCT) {
      warnings.push(
        `The gzipped worker bundle is at ${usedPct.toFixed(1)}% of the ${limitMib} MiB Cloudflare Workers limit.`,
      );
    }
    if (growth !== null && growth >= growthWarnPct) {
      warnings.push(
        `The gzipped worker bundle grew ${growth.toFixed(1)}% vs main (${bundle.gzipKiB} KiB vs ${baseline.gzipKiB} KiB).`,
      );
    }
  } else {
    lines.push("- Worker bundle: _size not found in the wrangler output_");
    warnings.push(`Could not parse the worker bundle size from ${logPath}.`);
  }

  lines.push(
    `- Static assets: ${formatMib(assets.bytes)} across ${assets.files} files (served separately — they do not count against the worker limit)`,
  );
  if (assets.largestBytes > MAX_ASSET_FILE_MIB * ONE_MIB) {
    warnings.push(
      `Asset ${assets.largestPath} is ${formatMib(assets.largestBytes)}, over the ${MAX_ASSET_FILE_MIB} MiB per-file limit.`,
    );
  }

  for (const warning of warnings) {
    console.error(`::warning::${warning}`);
  }
  console.log(
    [
      "#### Worker size",
      ...warnings.map((warning) => `> ⚠️ ${warning}`),
      ...lines,
    ].join("\n"),
  );
}

// wrangler logs `Total Upload: 2895.90 KiB / gzip: 550.63 KiB`, colorized when
// it thinks it has a TTY — hence the escape-code strip.
function parseBundleSize(log) {
  const match = log
    .replace(ANSI_CODES, "")
    .match(/Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/);
  return match ? { rawKiB: Number(match[1]), gzipKiB: Number(match[2]) } : null;
}

// A baseline is a nicety, not a requirement: main may not have recorded one yet,
// and its artifact expires. Any problem reading it just drops the comparison.
function readBaseline(path) {
  if (!path) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Number.isFinite(parsed.gzipKiB) && parsed.gzipKiB > 0
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function measureAssets(dir) {
  const totals = { bytes: 0, files: 0, largestBytes: 0, largestPath: "" };
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return; // No assets built (or a bad ASSETS_DIR) — report zero rather than fail the deploy.
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      const { size } = statSync(path);
      totals.bytes += size;
      totals.files += 1;
      if (size > totals.largestBytes) {
        totals.largestBytes = size;
        totals.largestPath = path.slice(dir.length + 1);
      }
    }
  };
  walk(dir);
  return totals;
}

function formatMib(bytes) {
  return `${(bytes / ONE_MIB).toFixed(2)} MiB`;
}

function signed(percent) {
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}`;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

main();
