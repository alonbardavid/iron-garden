import { Box, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { AD_HOC_CHANNEL, AD_HOC_NAME, type ChatAgent } from "@lib/contract";
import { palette } from "@lib/ds";
import { CheckIcon, ChevronIcon } from "../../../components/icons";
import { timeAgo } from "../../../logic/time";
import type { Chat } from "./ChatProvider";
import { initials } from "./model";

const LIVE = palette.added;
const AWAY = palette.divider;

// Who to talk to: your agents listening on the pull request, or ad hoc, which
// the server answers while it processes pull requests (greyed out when not).
export const AgentPicker = ({
  chat,
  agent,
}: {
  chat: Chat;
  agent: ChatAgent;
}) => (
  <Menu position="bottom-start" width={360} shadow="md">
    <Menu.Target>
      <UnstyledButton
        aria-label={`Who to talk to: ${agent.agent.name}`}
        h={28}
        px={8}
        fz={12.5}
        fw={500}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          border: `1px solid ${palette.control}`,
          borderRadius: 6,
        }}
      >
        <Dot live={agent.live} />
        {agent.agent.name}
        <ChevronIcon />
      </UnstyledButton>
    </Menu.Target>
    <Menu.Dropdown>
      {chat.agents
        ?.filter((a) => !a.adHoc)
        .map((a) => (
          <AgentOption
            key={a.channel}
            agent={a}
            selected={a.channel === agent.channel}
            onPick={() => chat.pick(a.channel)}
          />
        ))}
      <AdHocOption
        adHoc={chat.agents?.find((a) => a.adHoc)}
        selected={agent.adHoc}
        onPick={chat.pick}
      />
    </Menu.Dropdown>
  </Menu>
);

const AgentOption = ({
  agent,
  selected,
  onPick,
}: {
  agent: ChatAgent;
  selected: boolean;
  onPick: () => void;
}) => (
  <Menu.Item
    onClick={onPick}
    aria-current={selected || undefined}
    leftSection={
      <Box w={12} c={palette.accent}>
        {selected && <CheckIcon size={12} />}
      </Box>
    }
  >
    <Group gap={8} wrap="nowrap">
      <AgentAvatar name={agent.agent.name} />
      <div>
        <Group gap={7} fz={13} fw={500} wrap="nowrap">
          <Dot live={agent.live} />
          {agent.agent.name}
        </Group>
        <Text fz={12} c={palette.muted}>
          {describe(agent)}
        </Text>
      </div>
    </Group>
  </Menu.Item>
);

// The server answering, when it does; greyed out otherwise.
const AdHocOption = ({
  adHoc,
  selected,
  onPick,
}: {
  adHoc: ChatAgent | undefined;
  selected: boolean;
  onPick: (channel: string) => void;
}) => (
  <Menu.Item
    disabled={!adHoc}
    onClick={() => onPick(AD_HOC_CHANNEL)}
    aria-current={selected || undefined}
    leftSection={
      <Box w={12} c={palette.accent}>
        {selected && <CheckIcon size={12} />}
      </Box>
    }
  >
    <Group gap={8} wrap="nowrap">
      <AgentAvatar name={AD_HOC_NAME} />
      <div>
        <Text fz={13} fw={500}>
          {AD_HOC_NAME}
        </Text>
        <Text fz={12} c={palette.muted}>
          {adHoc
            ? "This server answers, with the change and its transcripts"
            : "Agents are not enabled on this server"}
        </Text>
      </div>
    </Group>
  </Menu.Item>
);

// "Made this change · live".
function describe(agent: ChatAgent): string {
  const presence = agent.live
    ? "live"
    : agent.lastSeenAt
      ? `offline since ${timeAgo(agent.lastSeenAt)}`
      : "not connected yet";
  return [agent.madeThis ? "Made this change" : "Your agent", presence].join(
    " · ",
  );
}

export const AgentAvatar = ({ name }: { name: string }) => (
  <Text
    span
    aria-hidden
    w={24}
    h={24}
    fz={10}
    fw={600}
    c={palette.accentInk}
    bg={palette.accentTint}
    style={{
      flex: "0 0 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 6,
    }}
  >
    {initials(name)}
  </Text>
);

const Dot = ({ live }: { live: boolean }) => (
  <span
    aria-hidden
    style={{
      width: 7,
      height: 7,
      borderRadius: "50%",
      flexShrink: 0,
      background: live ? LIVE : AWAY,
    }}
  />
);
