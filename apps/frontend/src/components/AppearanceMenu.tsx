import {
  Menu,
  useMantineColorScheme,
  type MantineColorScheme,
} from "@mantine/core";
import { CheckIcon } from "./icons";

// The account menu's theme choice; Mantine keeps it in local storage.
export const AppearanceMenu = () => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <Menu.Sub position="left-start" offset={4}>
      <Menu.Sub.Target>
        <Menu.Sub.Item>Appearance</Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown miw={180}>
        {SCHEMES.map((scheme) => (
          <Menu.Item
            key={scheme.value}
            onClick={() => setColorScheme(scheme.value)}
            rightSection={
              colorScheme === scheme.value && <CheckIcon size={12} />
            }
          >
            {scheme.label}
          </Menu.Item>
        ))}
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  );
};

const SCHEMES: { value: MantineColorScheme; label: string }[] = [
  { value: "light", label: "Light mode" },
  { value: "dark", label: "Dark mode" },
  { value: "auto", label: "System" },
];
