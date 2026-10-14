import {
  Avatar,
  Divider,
  Group,
  Menu,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { palette } from "@lib/ds";
import { useSignedInMe } from "../logic/authentication/useMe";
import { useLogout } from "../logic/authentication/useLogout";
import { AppearanceMenu } from "./AppearanceMenu";
import board from "./board.module.css";
import { Wordmark } from "./Logo";

export interface Crumb {
  label: string;
  to?: string;
}

export const AppHeader = ({
  crumbs = [],
  children,
}: {
  crumbs?: Crumb[];
  children?: ReactNode;
}) => (
  <header style={{ background: palette.surface }}>
    <Group h={56} px={24} justify="space-between" wrap="nowrap">
      <Group gap={16} wrap="nowrap">
        <Link
          to="/"
          aria-label="Repositories"
          style={{ textDecoration: "none", display: "flex" }}
        >
          <Wordmark />
        </Link>
        {crumbs.length > 0 && (
          <>
            <Divider orientation="vertical" h={20} my="auto" />
            <Breadcrumbs crumbs={crumbs} />
          </>
        )}
      </Group>
      <UserMenu />
    </Group>
    {children}
  </header>
);

const Breadcrumbs = ({ crumbs }: { crumbs: Crumb[] }) => (
  <Group gap={6} wrap="nowrap">
    {crumbs.map((crumb, i) => (
      <Fragment key={i}>
        {i > 0 && (
          <Text fz={14} c={palette.faint}>
            /
          </Text>
        )}
        {crumb.to ? (
          <Text
            component={Link}
            to={crumb.to}
            fz={14}
            fw={weight(i, crumbs.length)}
          >
            {crumb.label}
          </Text>
        ) : (
          <Text fz={14} fw={weight(i, crumbs.length)}>
            {crumb.label}
          </Text>
        )}
      </Fragment>
    ))}
  </Group>
);

// The last crumb is the page you are on.
const weight = (i: number, count: number) => (i === count - 1 ? 600 : 400);

const UserMenu = () => {
  const me = useSignedInMe();
  const logout = useLogout();
  return (
    <Menu position="bottom-end" width={220}>
      <Menu.Target>
        <UnstyledButton aria-label="Account menu">
          <Avatar
            size={34}
            radius={0}
            className={board.hex}
            styles={{
              placeholder: {
                background: palette.accentTint,
                color: palette.accent,
                fontSize: 12,
              },
            }}
          >
            {initials(me.name)}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          {me.name}
          {me.username && <Text size="xs">{me.username}</Text>}
        </Menu.Label>
        <Menu.Item component={Link} to="/account">
          Account
        </Menu.Item>
        {me.role === "admin" && (
          <Menu.Item component={Link} to="/admin/users">
            Admin
          </Menu.Item>
        )}
        <AppearanceMenu />
        <Menu.Divider />
        <Menu.Item onClick={logout}>Sign out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
