import { Button, Text } from "@react-email/components";
import { EmailLayout, emailGlobals } from "@lib/email-ds";

export interface InviteProps {
  name: string;
  url: string;
}

export const subject = `You're invited to ${emailGlobals.productName}`;

export default function Invite({ name, url }: InviteProps) {
  return (
    <EmailLayout
      preview={`Choose a password to start using ${emailGlobals.productName}`}
    >
      <Text style={heading}>You&apos;re invited</Text>
      <Text style={paragraph}>
        Hi {name}, an admin created an account for you on{" "}
        {emailGlobals.productName}. Click the button below to choose your
        password and sign in.
      </Text>
      <Button href={url} style={button}>
        Choose a password
      </Button>
      <Text style={muted}>
        The link works for 7 days. After that, use &quot;Forgot password?&quot;
        on the sign-in page to get a new one.
      </Text>
    </EmailLayout>
  );
}

Invite.PreviewProps = {
  name: "Ada Lovelace",
  url: "https://example.com/reset-password?invite=1&token=preview-token",
} satisfies InviteProps;

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
