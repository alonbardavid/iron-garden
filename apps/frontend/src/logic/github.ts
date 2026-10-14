// What a person pastes for a GitHub repository: owner/repo, its page, or a
// clone URL. Null when it is none of those.
export function parseGithubRepository(
  input: string,
): { owner: string; repo: string } | null {
  const path = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(path);
  return match ? { owner: match[1]!, repo: match[2]! } : null;
}
