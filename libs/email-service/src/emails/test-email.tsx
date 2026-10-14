import { Button, Text } from "@react-email/components";
import { EmailLayout, emailGlobals } from "@lib/email-ds";

export interface TestEmailProps {
  name: string;
  url: string;
}

export const subject = "Email is working";

export default function TestEmail({ name, url }: TestEmailProps) {
  return (
    <EmailLayout
      preview={`${emailGlobals.productName} can send email from this address`}
    >
      <Text style={heading}>Email is working</Text>
      <Text style={paragraph}>
        Hi {name}, this is the test you sent from the Email page in{" "}
        {emailGlobals.productName}. Mail from this address reaches your inbox,
        so password resets can go out by email now.
      </Text>
      <Button href={url} style={button}>
        Open email settings
      </Button>
    </EmailLayout>
  );
}

TestEmail.PreviewProps = {
  name: "Ada Lovelace",
  url: "https://example.com/admin/email",
} satisfies TestEmailProps;

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
