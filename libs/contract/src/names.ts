import { z } from "zod";

// Usernames, agent names and repository names share one shape: they appear in
// git URLs and as git logins, so they are lowercase and URL-safe.
const NAME = /^[a-z0-9](?:[a-z0-9]|-(?!-)){1,37}[a-z0-9]$/;

// First path segments the app routes itself; a repository named after one would
// shadow it at /<name>.git.
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "api",
  "r",
  "account",
  "admin",
  "setup",
  "login",
  "password",
  "assets",
  "new",
  "settings",
]);

export const NAME_RULE =
  "3 to 39 lowercase letters, digits or single dashes, starting and ending with a letter or digit";

export function isValidName(name: string): boolean {
  return NAME.test(name) && !RESERVED_NAMES.has(name);
}

export const nameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidName, { error: `Use ${NAME_RULE}` });
