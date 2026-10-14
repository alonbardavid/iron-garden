import type { BrowserContext, Page } from "@playwright/test";
import type { ReceivedEmail } from "./inbox";

export async function openEmail(
  context: BrowserContext,
  message: ReceivedEmail,
): Promise<Page> {
  const emailPage = await context.newPage();
  await emailPage.setContent(message.html, { waitUntil: "domcontentloaded" });
  await emailPage.evaluate((subject) => {
    document.title = subject;
  }, message.subject);
  return emailPage;
}

export async function clickEmailLink(
  emailPage: Page,
  name: string,
): Promise<Page> {
  const [opened] = await Promise.all([
    emailPage.context().waitForEvent("page"),
    emailPage.getByRole("link", { name }).click(),
  ]);
  await opened.waitForLoadState("domcontentloaded");
  return opened;
}
