import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailGlobals } from "./globals";

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={body}>
      <Container style={container}>
        <Section style={brandSection}>
          <Text style={brandText}>{emailGlobals.productName}</Text>
        </Section>
        <Section style={card}>{children}</Section>
        <Section>
          <Text style={footerText}>
            You received this email because this address was used to sign up for{" "}
            {emailGlobals.productName}.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

const body = {
  backgroundColor: "#f4f5f7",
  fontFamily: "Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
};

const container = { maxWidth: "600px", margin: "0 auto", padding: "24px" };

const brandSection = { padding: "8px 0" };

const brandText = {
  textAlign: "center" as const,
  fontSize: "20px",
  fontWeight: 700,
  color: "#243b53",
};

const card = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "8px 24px 16px",
};

const footerText = {
  textAlign: "center" as const,
  fontSize: "12px",
  color: "#9aa5b1",
};
