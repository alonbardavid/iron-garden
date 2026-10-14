import { readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PostalMime, { type Address, type Email } from "postal-mime";

export interface ReceivedEmail {
  to: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  html: string;
  text: string;
  url: string;
}

const DEFAULT_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 300;

export function waitForVerificationEmail(
  recipient: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ReceivedEmail> {
  return waitForEmailWithLink(recipient, /verify-email/, timeoutMs);
}

export function waitForResetPasswordEmail(
  recipient: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ReceivedEmail> {
  return waitForEmailWithLink(recipient, /reset-password/, timeoutMs);
}

export async function waitForEmailWithLink(
  recipient: string,
  linkPattern: RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ReceivedEmail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const email = await findEmailWithLink(recipient, linkPattern);
    if (email) {
      return email;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`No email matching ${linkPattern} found for ${recipient}`);
}

async function findEmailWithLink(
  recipient: string,
  linkPattern: RegExp,
): Promise<ReceivedEmail | null> {
  for (const file of listEmlFiles()) {
    const message = await parseEml(file);
    if (!message || !addressedTo(message, recipient)) {
      continue;
    }
    const url = findLink(message.html ?? "", linkPattern);
    if (url) {
      return toReceivedEmail(message, recipient, url);
    }
  }
  return null;
}

function toReceivedEmail(
  message: Email,
  recipient: string,
  url: string,
): ReceivedEmail {
  return {
    to: recipient,
    fromAddress: addressOf(message.from),
    fromName: message.from?.name ?? "",
    subject: message.subject ?? "",
    html: message.html ?? "",
    text: message.text ?? "",
    url,
  };
}

function addressedTo(message: Email, recipient: string): boolean {
  return (message.to ?? []).some(
    (address) => addressOf(address).toLowerCase() === recipient.toLowerCase(),
  );
}

function addressOf(address: Address | undefined): string {
  return address?.address ?? "";
}

function findLink(html: string, linkPattern: RegExp): string | null {
  const hrefs = html.matchAll(/href="([^"]+)"/g);
  for (const [, href] of hrefs) {
    const url = href.replace(/&amp;/g, "&");
    if (linkPattern.test(url)) {
      return url;
    }
  }
  return null;
}

const parsedEmails = new Map<string, Email>();

async function parseEml(file: string): Promise<Email | null> {
  const cached = parsedEmails.get(file);
  if (cached) {
    return cached;
  }
  const message = await PostalMime.parse(readFileSync(file, "utf8"));
  if (!message.html) {
    return null;
  }
  parsedEmails.set(file, message);
  return message;
}

function listEmlFiles(): string[] {
  const base = tmpdir();
  const files: string[] = [];
  for (const entry of safeReaddir(base)) {
    if (entry.startsWith("miniflare-")) {
      collectEml(join(base, entry), files, 0);
    }
  }
  return files.sort((a, b) => modifiedAt(b) - modifiedAt(a));
}

function collectEml(dir: string, out: string[], depth: number): void {
  if (depth > 4) {
    return;
  }
  for (const entry of safeReaddir(dir)) {
    const full = join(dir, entry);
    if (entry.endsWith(".eml")) {
      out.push(full);
    } else if (isDirectory(full)) {
      collectEml(full, out, depth + 1);
    }
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function modifiedAt(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
