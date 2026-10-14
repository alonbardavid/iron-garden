// Encryption for the GitHub secrets the instance must send back out (tokens,
// webhook secrets), and the check on what GitHub signs.

const encoder = new TextEncoder();
const FORMAT = "v1";

// An AES-GCM key derived from the instance secret, so no extra secret has to
// be configured. Rotating the instance secret makes stored tokens unreadable.
export async function deriveKey(instanceSecret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(instanceSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      // Key material: every stored GitHub token and webhook secret is
      // encrypted under this salt, so changing it makes them unreadable.
      salt: encoder.encode("iron-garden"),
      info: encoder.encode("github-secrets"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );
  return [FORMAT, toBase64(iv), toBase64(new Uint8Array(ciphertext))].join(".");
}

// Null when the value was not encrypted with this key.
export async function decrypt(
  key: CryptoKey,
  stored: string,
): Promise<string | null> {
  const [format, iv, ciphertext] = stored.split(".");
  if (format !== FORMAT || !iv || !ciphertext) {
    return null;
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      key,
      fromBase64(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

// 256 random bits, hex: a webhook secret the instance generates.
export function randomSecret(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// GitHub signs a delivery's raw body with the hook's secret:
// `X-Hub-Signature-256: sha256=<hex HMAC-SHA256>`. HMAC verify is
// constant-time.
export async function verifySignature(
  secret: string,
  body: Uint8Array,
  header: string | null,
): Promise<boolean> {
  const hex = header?.startsWith("sha256=") ? header.slice(7) : null;
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = new Uint8Array(
    hex.match(/../g)!.map((pair) => parseInt(pair, 16)),
  );
  return crypto.subtle.verify("HMAC", key, signature, body);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
