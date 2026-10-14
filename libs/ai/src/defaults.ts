// A Workers AI coding model with a context window that fits a large change.
// Admins pick another under Admin > Agent config.
export const DEFAULT_MODEL = "@cf/zai-org/glm-5.3-flash";

// The AI Gateway model calls go through when the admin names none; AI
// Gateway creates it on first use, so calls are logged with no setup.
export const DEFAULT_GATEWAY = "default";

// The most words of the agent's transcripts a prompt carries, the latest.
export const DEFAULT_MAX_TRANSCRIPT_WORDS = 20_000;
