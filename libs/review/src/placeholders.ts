// Who a grouping prompt is for: the agent that opened the pull request, or
// the model that groups it on the server.
export const PROMPT_KINDS = ["agent", "server"] as const;
export type PromptKind = (typeof PROMPT_KINDS)[number];

const SHARED = {
  repository: "Repository name",
  number: "Pull request number",
  title: "Pull request title",
  description: "Pull request description, or (none)",
  branch: "The branch under review",
  baseCommit:
    "Commit the branch is compared with, where it leaves the target branch",
  headCommit: "Commit at the head of the branch",
  changedFiles: "One line per changed file: path, change and line count",
  rules:
    "The repository's rules, what each does and the ones to judge, or nothing; added at the end when the prompt leaves it out",
} as const;

// Every {{placeholder}} each grouping prompt may use, with what replaces it.
export const PROMPT_PLACEHOLDERS = {
  agent: {
    ...SHARED,
    submitUrl: "Where to PUT the groups",
    commentsUrl: "Where the agent POSTs a comment explaining lines",
  },
  server: {
    ...SHARED,
    changes:
      "Every changed file's diff, numbered on both sides, with a few unchanged lines around each change",
    transcripts:
      "The conversations in which the agent made the change, from the transcripts on its commits: their latest words, up to the transcript limit, or (none)",
  },
} as const satisfies Record<PromptKind, Record<string, string>>;

export type PromptValues<Kind extends PromptKind> = Record<
  keyof (typeof PROMPT_PLACEHOLDERS)[Kind],
  string
>;
