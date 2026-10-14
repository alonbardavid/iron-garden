import type { FunctionComponent } from "react";

export interface EmailTemplate<Props> {
  subject: (props: Props) => string;
  Body: FunctionComponent<Props>;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}
