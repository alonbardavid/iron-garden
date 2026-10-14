import { env } from "cloudflare:workers";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("ai/sandbox");

/**
 * Code to run in a Dynamic Worker. `name` must change whenever the modules
 * do: the loader keeps a loaded Worker warm under its name and would go on
 * running the old code.
 */
export interface SandboxCode {
  name: string;
  mainModule: string;
  modules: Record<string, string>;
}

const COMPATIBILITY_DATE = "2026-02-13";

/**
 * The default entrypoint of `code`, loaded into its own isolate by the Worker
 * Loader. It has no network and no bindings: everything it may touch is an
 * RPC stub the caller passes to its methods.
 */
export function sandboxEntrypoint<Entrypoint>(code: SandboxCode): Entrypoint {
  const loader = (env as unknown as { LOADER?: WorkerLoader }).LOADER;
  if (!loader) {
    throw new Error("The Worker Loader is not bound on this deployment");
  }
  const worker = loader.get(code.name, () => {
    log.info("sandbox loaded", { name: code.name });
    return {
      compatibilityDate: COMPATIBILITY_DATE,
      mainModule: code.mainModule,
      modules: code.modules,
      globalOutbound: null,
    };
  });
  return worker.getEntrypoint() as unknown as Entrypoint;
}
