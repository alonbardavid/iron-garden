import { renderEmail } from "@lib/email-ds";
import { PRODUCT_DISPLAY_NAME } from "@lib/contract";
import { moduleLogger } from "@lib/logging";
import { testEmail } from "./emails";
import { sendEmail } from "./send";

const log = moduleLogger("email-service/test-email");

// The admin email page's test: sends the admin a message from `sender` and
// says why it failed, if it did. Saves nothing.
export async function sendTestEmail(input: {
  userId: string;
  to: string;
  name: string;
  sender: string;
  url: string;
}): Promise<{ error: string | null }> {
  const { subject, html } = await renderEmail(testEmail, {
    name: input.name,
    url: input.url,
  });
  try {
    await sendEmail({
      to: input.to,
      subject,
      html,
      from: input.sender,
      fromName: PRODUCT_DISPLAY_NAME,
    });
  } catch (err) {
    log.warn("test email failed", { userId: input.userId });
    return { error: err instanceof Error ? err.message : String(err) };
  }
  log.info("test email sent", { userId: input.userId });
  return { error: null };
}
