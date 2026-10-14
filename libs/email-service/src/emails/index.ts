import type { EmailTemplate } from "@lib/email-ds";
import TestEmail, {
  subject as testEmailSubject,
  type TestEmailProps,
} from "./test-email";

export const testEmail: EmailTemplate<TestEmailProps> = {
  subject: () => testEmailSubject,
  Body: TestEmail,
};
