declare namespace Cloudflare {
  interface Env {
    CHAT_CHANNELS: DurableObjectNamespace<
      import("./chat/channel-object").ChatChannelObject
    >;
  }
}
