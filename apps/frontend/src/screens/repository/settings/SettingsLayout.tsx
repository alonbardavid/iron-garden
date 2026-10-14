import { Group } from "@mantine/core";
import { Outlet } from "react-router-dom";
import { NavCard } from "../../../components/NavCard";
import { Page } from "../../../components/Page";
import { useRepository } from "../RepositoryLayout";

export const SettingsLayout = () => {
  const { name } = useRepository();
  const base = `/r/${name}/settings`;
  return (
    <Page title="Settings" maw={1080}>
      <Group align="start" gap={20} wrap="nowrap">
        <NavCard
          sections={[
            {
              label: "Repository",
              links: [
                { label: "General", to: base },
                { label: "Access", to: `${base}/access` },
                { label: "Rules", to: `${base}/rules` },
                { label: "GitHub", to: `${base}/github` },
              ],
            },
          ]}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </div>
      </Group>
    </Page>
  );
};
