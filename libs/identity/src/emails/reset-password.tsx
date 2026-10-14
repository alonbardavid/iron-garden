import { Button, Text } from "@react-email/components";
import { EmailLayout, emailGlobals } from "@lib/email-ds";

export interface ResetPasswordProps {
  name: string;
  url: string;
}

export const subject = "Reset your password";

export default function ResetPassword({ name, url }: ResetPasswordProps) {
  return (
    <EmailLayout
      preview={`Reset the password for your ${emailGlobals.productName} account`}
    >
      <Text style={heading}>Reset your password</Text>
      <Text style={paragraph}>
        Hi {name}, we received a request to reset the password for your{" "}
        {emailGlobals.productName} account. Click the button below to choose a
        new password.
      </Text>
      <Button href={url} style={button}>
        Reset password
      </Button>
      <Text style={muted}>
        If you didn&apos;t request a password reset, you can safely ignore this
        email — your password will stay the same.
      </Text>
    </EmailLayout>
  );
}

ResetPassword.PreviewProps = {
  name: "Ada Lovelace",
  url: "https://example.com/reset-password?token=preview-token",
} satisfies ResetPasswordProps;

const heading = {
  fontSize: "18px",
  fontWeight: 700,
  color: "#243b53",
  paddingTop: "16px",
};

const paragraph = { fontSize: "15px", color: "#1f2933", lineHeight: "1.6" };

const button = {
  backgroundColor: "#2f6fed",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  padding: "12px 20px",
  textDecoration: "none",
};

const muted = { color: "#616e7c", fontSize: "13px" };
