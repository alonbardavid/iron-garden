import type { EmailTemplate } from "@lib/email-ds";
import VerifyEmail, {
  subject as verifyEmailSubject,
  type VerifyEmailProps,
} from "./verify-email";
import ResetPassword, {
  subject as resetPasswordSubject,
  type ResetPasswordProps,
} from "./reset-password";
import Invite, { subject as inviteSubject, type InviteProps } from "./invite";

export const verifyEmail: EmailTemplate<VerifyEmailProps> = {
  subject: () => verifyEmailSubject,
  Body: VerifyEmail,
};

export const resetPassword: EmailTemplate<ResetPasswordProps> = {
  subject: () => resetPasswordSubject,
  Body: ResetPassword,
};

export const invite: EmailTemplate<InviteProps> = {
  subject: () => inviteSubject,
  Body: Invite,
};
