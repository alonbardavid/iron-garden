import type { ChatPage, PullRequestSummary } from "@lib/contract";
import { withQuery } from "../../logic/url";

export type PullRequestTab = "overview" | "brackets" | "files" | "activity";

// A chat message stores the tab it was written on, the Brackets tab under its
// old name, "groups".
export const chatPage = (tab: PullRequestTab): ChatPage =>
  tab === "brackets" ? "groups" : tab;
export const chatPageTab = (page: ChatPage): PullRequestTab =>
  page === "groups" ? "brackets" : page;

// Where a pull request's tab lives, so every view of it can be bookmarked.
export function pullRequestPath(
  pr: Pick<PullRequestSummary, "repository" | "number">,
  tab: PullRequestTab = "overview",
  params: Record<string, string | null | undefined> = {},
): string {
  const base = `/r/${pr.repository}/pulls/${pr.number}`;
  return withQuery(tab === "overview" ? base : `${base}/${tab}`, params);
}

// Who splits a processing pull request into groups, as a sentence starts.
export const grouperName = (pr: Pick<PullRequestSummary, "groupedBy">) =>
  pr.groupedBy === "server" ? "The server" : "The agent";
