import type { ChatContextRow, GroupRangeRow } from "@lib/db-models";

// What the server's model gets to answer a reviewer's ad hoc question in
// chat: the whole change, its groups, how it was made, the conversation so
// far, and how to read more of the repository. Pure, so it is unit-tested.

export interface AnswerPromptInput {
  repository: string;
  pullRequest: {
    number: number;
    title: string;
    description: string | null;
    branch: string;
    targetBranch: string;
    baseCommit: string;
    headCommit: string;
  };
  changedFiles: string;
  groups: {
    title: string;
    kind: string;
    description: string | null;
    ranges: GroupRangeRow[];
  }[];
  transcripts: string;
  changes: string;
  // Every earlier message of the reviewer's ad hoc thread, oldest first.
  conversation: {
    sender: "person" | "agent";
    body: string;
    context?: ChatContextRow | null;
  }[];
  // The most of the thread the prompt carries; past it the oldest go.
  maxConversationChars: number;
}

export interface Question {
  author: string;
  body: string;
  context: ChatContextRow | null;
  // The title of the group the reviewer was looking at, if any.
  groupTitle?: string;
}

export function answerPrompt(input: AnswerPromptInput): string {
  const { pullRequest: pr } = input;
  return `You answer reviewers' questions about pull request #${pr.number} in ${input.repository}, in the chat beside the review.

Reviewers here read a change in groups of related lines and accept each group when they are satisfied with it. They ask you to understand it faster: what lines do, why they are there, what else they touch, whether something is safe.

- Ground every claim in the code: the diff below, and the files you read. Say so when you cannot tell.
- To show lines, add a fenced block in the language \`lines\` holding \`<path>:<start>-<end>\` (or \`<path>:<line>\`), with line numbers in the new version of a file, or the old one for a deleted file. The chat shows those lines in place of the block.
- Answer in short markdown. No preamble.

## The change

Title: ${pr.title}
Branch: ${pr.branch} (head ${pr.headCommit}), into ${pr.targetBranch} (from ${pr.baseCommit || "an empty repository"})

Description:
${pr.description || "(none)"}

Changed files:
${input.changedFiles || "(none)"}

## Its groups

${renderGroups(input.groups)}

## How it was made

The conversations in which an agent made this change, when it recorded them.

${input.transcripts}

## The diff

Each file starts with a "### path" line. Every line after it shows its number in the old version, its number in the new version, a marker and the text: "+" added, "-" removed, a space unchanged. "..." stands for unchanged lines left out.

${input.changes}

## Reading the repository

You may read more of the repository before you answer: "base" is the target branch where the change leaves it, "head" is the branch. Ask with one JSON object instead of your answer, up to 10 requests at a time and 8 times in all:

    { "requests": [
      { "read": "src/billing/invoice.ts", "at": "head" },
      { "list": "base", "under": "src/routes" }
    ] }

## The conversation so far

${renderConversation(input.conversation, input.maxConversationChars)}

## Your answer

Answer with one JSON object and nothing else: {"answer": "<your markdown>"}.`;
}

// The question as the model gets it: who asks, what they were looking at,
// and any text they had selected.
export function questionText(question: Question): string {
  const looking = question.context
    ? lookingAt(question.context, question.groupTitle)
    : null;
  const selected = question.context?.selectedText
    ? `\n\nThey had selected this text on the page:\n\n\`\`\`\n${question.context.selectedText}\n\`\`\``
    : "";
  return `${question.author} asks${looking ? ` (looking at ${looking})` : ""}:\n\n${question.body}${selected}`;
}

function lookingAt(context: ChatContextRow, groupTitle?: string): string {
  const parts: string[] = [`the ${context.page} tab`];
  if (context.group) {
    parts.push(`the group "${groupTitle ?? context.group}"`);
  }
  if (context.path) {
    parts.push(context.path);
  }
  if (context.start !== undefined && context.end !== undefined) {
    parts.push(
      context.start === context.end
        ? `line ${context.start}`
        : `lines ${context.start}-${context.end}`,
    );
  }
  return parts.join(", ");
}

function renderGroups(groups: AnswerPromptInput["groups"]): string {
  if (groups.length === 0) {
    return "(not grouped yet)";
  }
  return groups
    .map((group, i) => {
      const ranges = group.ranges
        .map((r) => `${r.path}:${r.start}-${r.end}`)
        .join(", ");
      const description = group.description ? `\n${group.description}` : "";
      return `${i + 1}. ${group.title} (${group.kind}): ${ranges}${description}`;
    })
    .join("\n\n");
}

// The whole thread, each question with what the reviewer was looking at.
// Past `maxChars` the newest are kept, and the oldest counted.
function renderConversation(
  conversation: AnswerPromptInput["conversation"],
  maxChars: number,
): string {
  if (conversation.length === 0) {
    return "(this is the first question)";
  }
  const kept: string[] = [];
  let used = 0;
  for (const message of [...conversation].reverse()) {
    const text = renderMessage(message);
    if (used + text.length > maxChars) {
      break;
    }
    kept.unshift(text);
    used += text.length;
  }
  const left = conversation.length - kept.length;
  return left === 0
    ? kept.join("\n\n")
    : [`(${left} earlier messages left out)`, ...kept].join("\n\n");
}

function renderMessage(
  message: AnswerPromptInput["conversation"][number],
): string {
  if (message.sender === "agent") {
    return `You: ${message.body}`;
  }
  const looking = message.context ? lookingAt(message.context) : null;
  return `Reviewer${looking ? ` (looking at ${looking})` : ""}: ${message.body}`;
}
