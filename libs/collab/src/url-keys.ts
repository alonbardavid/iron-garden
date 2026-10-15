// A key that is the only credential of a URL an agent listens on (chat, or a
// session's listener) carries as much entropy as an API key, and only its
// hash is stored.
const KEY_BYTES = 32;

export function newUrlKey(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  return prefix + base64Url(bytes);
}

export async function hashUrlKey(key: string): Promise<string> {
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
