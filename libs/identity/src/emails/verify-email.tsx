import { Button, Text } from "@react-email/components";
import { EmailLayout, emailGlobals } from "@lib/email-ds";

export interface VerifyEmailProps {
  name: string;
  url: string;
}

export const subject = "Verify your email address";

export default function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview={`Confirm your address to finish setting up your ${emailGlobals.productName} account`}
    >
      <Text style={heading}>Verify your email</Text>
      <Text style={paragraph}>
        Hi {name}, thanks for signing up. Confirm your email address to activate
        your {emailGlobals.productName} account.
      </Text>
      <Button href={url} style={button}>
        Verify email address
      </Button>
      <Text style={muted}>
        If you didn&apos;t create a {emailGlobals.productName} account, you can
        safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

VerifyEmail.PreviewProps = {
  name: "Ada Lovelace",
  url: "https://example.com/verify?token=preview-token",
} satisfies VerifyEmailProps;

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
