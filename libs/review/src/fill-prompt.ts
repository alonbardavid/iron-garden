import { getDb, pullRequestRules, eq, type FileChange } from "@lib/db-models";
import { renderTemplate, type PromptFlags } from "@lib/collab";
import { getProcessingPrompt } from "./prompt";
import { rulesSection } from "./rules/prompt";
import type { PromptKind, PromptValues } from "./placeholders";

export interface PromptPullRequest {
  id: string;
  number: number;
  title: string;
  description: string | null;
  branch: string;
  baseCommit: string;
  headCommit: string;
  files: {
    path: string;
    change: FileChange;
    oldLines: number;
    newLines: number;
  }[];
}

type SharedValues = Omit<PromptValues<"agent">, "submitUrl" | "commentsUrl">;

/**
 * The admin's grouping prompt of `kind`, filled in for one pull request.
 * `values` are the placeholders only that kind has; `flags` decide its
 * {{#if}} blocks.
 */
export async function fillGroupingPrompt<Kind extends PromptKind>(
  kind: Kind,
  repositoryName: string,
  pullRequest: PromptPullRequest,
  values: Omit<PromptValues<Kind>, keyof SharedValues>,
  flags: PromptFlags = {},
): Promise<string> {
  const [{ prompt }, rules] = await Promise.all([
    getProcessingPrompt(kind),
    rulesOf(pullRequest.id),
  ]);
  const rendered = renderTemplate(
    prompt,
    { ...sharedValues(repositoryName, pullRequest, rules), ...values },
    flags,
  );
  // A custom prompt without the slot still gets the rules to judge.
  return rules && !/\{\{\s*rules\s*\}\}/.test(prompt)
    ? `${rendered.trimEnd()}\n\n${rules}`
    : rendered;
}

function sharedValues(
  repositoryName: string,
  pullRequest: PromptPullRequest,
  rules: string,
): SharedValues {
  return {
    repository: repositoryName,
    number: String(pullRequest.number),
    title: pullRequest.title,
    description: pullRequest.description || "(none)",
    branch: pullRequest.branch,
    baseCommit: pullRequest.baseCommit || "(empty repository)",
    headCommit: pullRequest.headCommit,
    changedFiles: pullRequest.files
      .map(
        (f) =>
          `- ${f.path} (${f.change}, ${f.change === "deleted" ? f.oldLines : f.newLines} lines)`,
      )
      .join("\n"),
    rules,
  };
}

async function rulesOf(pullRequestId: string): Promise<string> {
  return rulesSection(
    await getDb()
      .select({
        id: pullRequestRules.id,
        name: pullRequestRules.name,
        match: pullRequestRules.match,
        action: pullRequestRules.action,
      })
      .from(pullRequestRules)
      .where(eq(pullRequestRules.pullRequestId, pullRequestId))
      .orderBy(pullRequestRules.position),
  );
}
