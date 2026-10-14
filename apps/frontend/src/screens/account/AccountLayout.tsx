import { Group } from "@mantine/core";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "../../components/AppHeader";
import { NavCard, type NavSection } from "../../components/NavCard";
import { Page } from "../../components/Page";
import { useSignedInMe } from "../../logic/authentication/useMe";

const ACCOUNT: NavSection = {
  label: "Account",
  links: [
    { label: "Profile and password", to: "/account" },
    { label: "API keys", to: "/account/keys" },
    { label: "GitHub tokens", to: "/account/github-tokens" },
    { label: "Agents", to: "/account/agents" },
  ],
};

const ADMIN: NavSection = {
  label: "Admin",
  links: [
    { label: "Users", to: "/admin/users" },
    { label: "Agent config", to: "/admin/agent" },
    { label: "Email sending", to: "/admin/email" },
  ],
};

// Account and admin pages share the header and the left nav.
export const AccountLayout = () => {
  const me = useSignedInMe();
  const isAdminPage = useLocation().pathname.startsWith("/admin");
  const title = isAdminPage ? "Admin" : "Account";
  return (
    <>
      <AppHeader crumbs={[{ label: title }]} />
      <Page title={title} maw={1080}>
        <Group align="start" gap={20} wrap="nowrap">
          <NavCard
            sections={me.role === "admin" ? [ACCOUNT, ADMIN] : [ACCOUNT]}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Outlet />
          </div>
        </Group>
      </Page>
    </>
  );
};
