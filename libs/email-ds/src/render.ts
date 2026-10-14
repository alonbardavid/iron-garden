import { createElement } from "react";
import { render } from "@react-email/render";
import type { EmailTemplate, RenderedEmail } from "./template";

export async function renderEmail<Props extends object>(
  template: EmailTemplate<Props>,
  props: Props,
): Promise<RenderedEmail> {
  const html = await render(createElement(template.Body, props));
  return { subject: template.subject(props), html };
}
