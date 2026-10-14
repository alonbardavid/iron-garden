import { env } from "cloudflare:workers";
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import { getEmailSettings } from "@lib/capabilities";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("email-service/send");

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  // Defaults to the sender saved on the admin Email sending page.
  from?: string;
}

interface EmailBinding {
  send(message: EmailMessage): Promise<void>;
}

// Thrown when the Worker has no SEND_EMAIL binding or the instance no sender.
export class EmailUnavailable extends Error {}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { SEND_EMAIL } = env as unknown as { SEND_EMAIL?: EmailBinding };
  if (!SEND_EMAIL) {
    throw new EmailUnavailable(
      "Email sending is not configured on this deployment (no SEND_EMAIL binding)",
    );
  }
  const from = input.from ?? (await getEmailSettings()).sender;
  if (!from) {
    throw new EmailUnavailable("No sender address is set for email");
  }
  const raw = buildMimeMessage(input, from);

  await SEND_EMAIL.send(new EmailMessage(from, input.to, raw));
  log.info("email sent", { subject: input.subject });
}

function buildMimeMessage(input: SendEmailInput, from: string): string {
  const message = createMimeMessage();
  message.setSender(
    input.fromName ? { name: input.fromName, addr: from } : from,
  );
  message.setRecipient(input.to);
  message.setSubject(input.subject);
  if (input.text) {
    message.addMessage({ contentType: "text/plain", data: input.text });
  }
  message.addMessage({ contentType: "text/html", data: input.html });
  return message.asRaw();
}
