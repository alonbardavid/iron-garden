import { env } from "cloudflare:workers";

// Optional bindings a deployment may or may not have. Features ask
// getBindings() or getCapabilities() instead of probing env, so a deploy
// without them degrades the same way everywhere.
interface OptionalEnv {
  ARTIFACTS?: unknown;
  AI?: unknown;
  LOADER?: unknown;
  PROCESSING?: unknown;
}

export interface Bindings {
  git: boolean;
  // Server-side processing needs all three: the model, the Durable Object
  // that runs its jobs, and the loader that runs each in a sandboxed Worker.
  ai: boolean;
}

let cached: Bindings | null = null;

// What the deploy binds; fixed for the life of the Worker.
export function getBindings(): Bindings {
  cached ??= detect(env as OptionalEnv);
  return cached;
}

function detect({ ARTIFACTS, AI, LOADER, PROCESSING }: OptionalEnv): Bindings {
  return {
    git: ARTIFACTS !== undefined,
    ai: AI !== undefined && LOADER !== undefined && PROCESSING !== undefined,
  };
}
