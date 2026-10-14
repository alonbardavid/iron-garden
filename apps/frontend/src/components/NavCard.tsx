import { NavLink, Paper, Stack, Text } from "@mantine/core";
import { Link, useLocation } from "react-router-dom";

export interface NavSection {
  label: string;
  links: { label: string; to: string }[];
}

// The left column of settings pages: one card per section, so account
// settings and admin settings never share a card.
export const NavCard = ({ sections }: { sections: NavSection[] }) => {
  const { pathname } = useLocation();
  const active = longestMatch(
    pathname,
    sections.flatMap((s) => s.links.map((l) => l.to)),
  );
  return (
    <Stack gap={12} w={240} style={{ flexShrink: 0 }}>
      {sections.map((section) => (
        <SectionCard key={section.label} section={section} active={active} />
      ))}
    </Stack>
  );
};

const SectionCard = ({
  section,
  active,
}: {
  section: NavSection;
  active: string | undefined;
}) => (
  <Paper
    withBorder
    radius="md"
    p={6}
    component="nav"
    aria-label={section.label}
  >
    <Text size="xs" fw={600} c="dimmed" px={8} pt={10} pb={4}>
      {section.label}
    </Text>
    {section.links.map((link) => (
      <NavLink
        key={link.to}
        component={Link}
        to={link.to}
        label={link.label}
        active={link.to === active}
        style={{ borderRadius: 6 }}
      />
    ))}
  </Paper>
);

function longestMatch(pathname: string, paths: string[]): string | undefined {
  return paths
    .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
}
