declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    SEND_EMAIL?: SendEmail;
    ARTIFACTS?: Artifacts;
    AI?: Ai;
    LOADER?: WorkerLoader;
    PROCESSING: DurableObjectNamespace<
      import("./processing").PullRequestProcessor
    >;
    SETUP_TOKEN?: string;
    CHAT_CHANNELS: DurableObjectNamespace<
      import("@lib/review").ChatChannelObject
    >;
  }
}

declare module "virtual:processing-sandbox" {
  const code: import("@lib/ai").SandboxCode;
  export default code;
}
