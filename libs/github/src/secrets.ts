import { env } from "cloudflare:workers";
import { deriveKey, decrypt, encrypt } from "./crypto";
import { GithubError } from "./api";

let key: Promise<CryptoKey> | null = null;

function instanceKey(): Promise<CryptoKey> {
  key ??= deriveKey(
    (env as unknown as { BETTER_AUTH_SECRET: string }).BETTER_AUTH_SECRET,
  );
  return key;
}

export async function seal(plaintext: string): Promise<string> {
  return encrypt(await instanceKey(), plaintext);
}

export async function unseal(stored: string): Promise<string> {
  const plaintext = await decrypt(await instanceKey(), stored);
  if (plaintext === null) {
    throw new GithubError(
      "UNAUTHORIZED",
      "A stored GitHub secret cannot be read: the instance secret changed. Add the token again.",
    );
  }
  return plaintext;
}
