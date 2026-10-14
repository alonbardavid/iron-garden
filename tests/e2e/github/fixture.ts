import { deriveKey, encrypt } from "@lib/github/crypto";
import { newEntityId } from "@lib/db-models/entity-ids";
import { TEST_ADMIN, TEST_USER } from "../users";

// The local-dev BETTER_AUTH_SECRET in apps/backend/wrangler.jsonc: the worker
// derives the key for GitHub secrets from it.
const INSTANCE_SECRET = "local-dev-secret-please-change-3f9a1c7d8e2b4506";

// A repository mirrored from GitHub, as connecting it would have left it,
// with a hook set up by hand. Nothing here reaches GitHub.
export const GITHUB_FIXTURE = {
  repository: "github-fixture",
  owner: "acme",
  repo: "web",
  // Fixed: the seed and the specs load this module separately, and the hook
  // URL names it.
  connectionId: "GHC_00000000-0000-4000-8000-0000000000e2",
  webhookSecret: "e2e-webhook-secret-0123456789abcdef",
  tokenName: "acme org",
  // Open pull requests whose branches GitHub pull requests will name.
  pullRequests: {
    linked: { number: 1, branch: "feature/login" },
    deleted: { number: 2, branch: "feature/gone" },
  },
};

const userId = (username: string) =>
  `(SELECT id FROM user WHERE username = '${username}')`;

export async function buildGithubFixtureSql(): Promise<string> {
  const f = GITHUB_FIXTURE;
  const key = await deriveKey(INSTANCE_SECRET);
  const repositoryId = newEntityId("REPOSITORY");
  const tokenId = newEntityId("GITHUB_TOKEN");
  return [
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', ${userId(TEST_ADMIN.username)}, 'admin'), ('${repositoryId}', ${userId(TEST_USER.username)}, 'read');`,
    `INSERT INTO github_tokens (id, user_id, name, token_ciphertext, token_hint, github_login) VALUES ('${tokenId}', ${userId(TEST_ADMIN.username)}, '${f.tokenName}', '${await encrypt(key, "github_pat_e2e_not_a_real_token")}', 'oken', 'acme-bot');`,
    `INSERT INTO github_connections (id, repository_id, owner, repo, token_id, webhook_secret_ciphertext) VALUES ('${f.connectionId}', '${repositoryId}', '${f.owner}', '${f.repo}', '${tokenId}', '${await encrypt(key, f.webhookSecret)}');`,
    ...Object.values(f.pullRequests).map(
      (pr) =>
        `INSERT INTO pull_requests (id, repository_id, number, title, branch, target_branch, base_commit, head_commit, status) VALUES ('${newEntityId("PULL_REQUEST")}', '${repositoryId}', ${pr.number}, 'Work on ${pr.branch}', '${pr.branch}', 'main', '${"a".repeat(40)}', '${"b".repeat(40)}', 'open');`,
    ),
  ].join("\n");
}
