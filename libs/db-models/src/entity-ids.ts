import { nanoid } from "nanoid";

export const ENTITY_PREFIXES = {
  USER: "U",
  USER_SESSION: "US",
  USER_ACCOUNT: "UA",
  USER_VERIFICATION: "UV",
  API_KEY: "AK",
  AGENT: "AGT",
  REPOSITORY: "REPO",
  AGENT_SESSION: "SES",
  PULL_REQUEST: "PR",
  PULL_REQUEST_FILE: "PRF",
  PULL_REQUEST_GROUP: "PRG",
  REVIEW_MARK: "MRK",
  REPOSITORY_RULE: "RULE",
  PULL_REQUEST_RULE: "PRR",
  INSTANCE_SETTING: "SET",
  GITHUB_TOKEN: "GHT",
  GITHUB_CONNECTION: "GHC",
  GITHUB_WORKFLOW_RUN: "GHR",
  PULL_REQUEST_COMMIT: "PRCM",
  TRANSCRIPT: "TR",
  PULL_REQUEST_COMMENT: "CMT",
  PULL_REQUEST_REVIEW: "REV",
  CHAT_CHANNEL: "CHC",
  CHAT_MESSAGE: "CHM",
} as const satisfies Record<string, Uppercase<string>>;

export type Entity = keyof typeof ENTITY_PREFIXES;

// These ids reach URLs and support conversations, so they are short.
const USER_VISIBLE_ID_ENTITIES: ReadonlySet<Entity> = new Set(["USER"]);

export function newEntityId(entity: Entity): string {
  const unique = USER_VISIBLE_ID_ENTITIES.has(entity)
    ? nanoid()
    : crypto.randomUUID();
  return `${ENTITY_PREFIXES[entity]}_${unique}`;
}
