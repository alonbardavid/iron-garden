// Per-target deploy settings. Nothing here names an instance: hostnames and
// senders come from the deploy environment (GitHub repo variables in CI), so
// one repo can deploy any number of instances.

// A leading bare wildcard covers the staging Worker's default workers.dev URL
// as well as every alias-prefixed preview URL uploaded to the same Worker.
const STAGING_WORKERS_DEV = "*iron-garden-staging.*.workers.dev";

export const ENVIRONMENTS = {
  production: {
    workerName: "iron-garden",
    allowedHosts: [],
    outFile: "wrangler.generated.production.json",
  },
  staging: {
    workerName: "iron-garden-staging",
    allowedHosts: [STAGING_WORKERS_DEV],
    outFile: "wrangler.generated.staging.json",
  },
  preview: {
    workerName: "iron-garden-staging",
    allowedHosts: [],
    outFile: "wrangler.generated.json",
  },
};

export function environmentFor(target) {
  const environment = ENVIRONMENTS[target];
  if (!environment) {
    throw new Error(
      `Unknown deploy target "${target}". Expected one of: ${Object.keys(ENVIRONMENTS).join(", ")}`,
    );
  }
  return environment;
}
