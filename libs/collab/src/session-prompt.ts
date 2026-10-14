import {
  DEFAULT_SESSION_PROMPT,
  SESSION_PROMPT_PLACEHOLDERS,
} from "./default-session-prompt";
import { promptSetting } from "./prompt-setting";
import { isClaude, renderTemplate } from "./template";

export interface SessionLinks {
  session: string;
  token: string;
  pullRequests: string;
  transcripts: string;
  end: string;
}

export interface InstructionInput {
  remote: string;
  tokenExpiresAt: string;
  baseBranch: string;
  baseCommit: string | null;
  links: SessionLinks;
  // What the agent named itself, or its user agent.
  client: string | null;
  // Whether the server, not the agent, groups the session's pull requests.
  groupedOnServer: boolean;
}

const sessionPrompt = promptSetting(
  "collab.sessionPrompt",
  DEFAULT_SESSION_PROMPT,
);

export const getSessionPrompt = sessionPrompt.get;
export const setSessionPrompt = sessionPrompt.set;
export const restoreDefaultSessionPrompt = sessionPrompt.restoreDefault;

// What an agent reads after starting a session: the session prompt filled
// in for it.
export async function sessionInstructions(
  input: InstructionInput,
): Promise<string> {
  const { prompt } = await getSessionPrompt();
  const base = input.baseCommit
    ? `\`${input.baseBranch}\` at \`${input.baseCommit}\``
    : `\`${input.baseBranch}\` (the repository has no commits yet)`;
  const values: Record<keyof typeof SESSION_PROMPT_PLACEHOLDERS, string> = {
    base,
    baseBranch: input.baseBranch,
    remote: input.remote,
    tokenExpiresAt: input.tokenExpiresAt,
    tokenUrl: input.links.token,
    sessionUrl: input.links.session,
    pullRequestsUrl: input.links.pullRequests,
    transcriptsUrl: input.links.transcripts,
    endUrl: input.links.end,
  };
  return renderTemplate(prompt, values, {
    claude: isClaude(input.client),
    serverGroups: input.groupedOnServer,
  });
}
