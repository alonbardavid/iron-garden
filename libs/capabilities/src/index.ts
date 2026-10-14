import type { Capabilities, EmailSettings } from "@lib/contract";
import { getBindings } from "./bindings";
import { getEmailSettings } from "./email";

// What the instance can do now: email is on once an admin enables it with a
// sender, which can change at runtime.
export async function getCapabilities(): Promise<Capabilities> {
  const { enabled, sender } = await getEmailSettings();
  const { git, ai } = getBindings();
  return { email: enabled && sender !== null, git, ai };
}

export { getBindings, type Bindings } from "./bindings";
export { getEmailSettings, saveEmailSettings } from "./email";
export type { Capabilities, EmailSettings };
