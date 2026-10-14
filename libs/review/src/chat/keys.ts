// A chat key is the only credential of the URL an agent listens on, so it
// carries as much entropy as an API key and only its hash is stored.
const PREFIX = "cgit_chat_";
const KEY_BYTES = 32;

export function newChatKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  return PREFIX + base64Url(bytes);
}

export async function hashChatKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
