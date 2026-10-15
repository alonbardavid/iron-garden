declare namespace Cloudflare {
  interface Env {
    SESSION_INBOXES: DurableObjectNamespace<
      import("./inbox-object").SessionInboxObject
    >;
  }
}
