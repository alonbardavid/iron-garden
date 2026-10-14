import {
  getDb,
  githubTokens,
  newEntityId,
  and,
  eq,
  desc,
} from "@lib/db-models";
import { ForgeError, requireUser } from "@lib/forge";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { githubApi } from "./api";
import { seal, unseal } from "./secrets";

const log = moduleLogger("github/tokens");

export interface GithubTokenSummary {
  id: string;
  name: string;
  hint: string;
  githubLogin: string;
  scopes: string | null;
  expiresAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
}

type TokenRow = typeof githubTokens.$inferSelect;

// A user's own GitHub tokens. Only people hold them: GitHub issues personal
// tokens to people, and an agent uses its owner's through the repositories
// they connected.
export async function listGithubTokens(
  principal: Principal,
): Promise<GithubTokenSummary[]> {
  requireUser(principal);
  const rows = await getDb()
    .select()
    .from(githubTokens)
    .where(eq(githubTokens.userId, principal.userId))
    .orderBy(desc(githubTokens.createdAt));
  return rows.map(toSummary);
}

// Checks the token with GitHub before keeping it, so a typo fails here rather
// than at the first sync.
export async function addGithubToken(
  principal: Principal,
  input: { name: string; token: string },
): Promise<GithubTokenSummary> {
  requireUser(principal);
  const identity = await githubApi(input.token).identity();
  const [row] = await getDb()
    .insert(githubTokens)
    .values({
      id: newEntityId("GITHUB_TOKEN"),
      userId: principal.userId,
      name: input.name,
      tokenCiphertext: await seal(input.token),
      tokenHint: input.token.slice(-4),
      githubLogin: identity.login,
      scopes: identity.scopes,
      expiresAt: identity.expiresAt,
    })
    .returning();
  log.info("github token added", {
    userId: principal.userId,
    tokenId: row!.id,
    classic: identity.scopes !== null,
  });
  return toSummary(row!);
}

export interface TokenRepository {
  owner: string;
  repo: string;
  private: boolean;
  description: string | null;
}

// What one of the caller's tokens can reach on GitHub, to pick from.
export async function listTokenRepositories(
  principal: Principal,
  tokenId: string,
): Promise<TokenRepository[]> {
  const row = await ownedToken(principal, tokenId);
  const listed = await githubApi(
    await unseal(row.tokenCiphertext),
  ).repositories();
  return listed.map((repository) => ({
    owner: repository.owner.login,
    repo: repository.name,
    private: repository.private,
    description: repository.description,
  }));
}

// Repositories connected with the token stay connected but stop syncing
// until someone connects them with another token.
export async function deleteGithubToken(
  principal: Principal,
  tokenId: string,
): Promise<void> {
  const row = await ownedToken(principal, tokenId);
  await getDb().delete(githubTokens).where(eq(githubTokens.id, row.id));
  log.info("github token deleted", { userId: principal.userId, tokenId });
}

export async function ownedToken(
  principal: Principal,
  tokenId: string,
): Promise<TokenRow> {
  requireUser(principal);
  const [row] = await getDb()
    .select()
    .from(githubTokens)
    .where(
      and(
        eq(githubTokens.id, tokenId),
        eq(githubTokens.userId, principal.userId),
      ),
    );
  if (!row) {
    throw new ForgeError("NOT_FOUND", "GitHub token not found");
  }
  return row;
}

// The token in the clear, for a call to GitHub on a connection's behalf.
export async function tokenPlaintext(tokenId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ ciphertext: githubTokens.tokenCiphertext })
    .from(githubTokens)
    .where(eq(githubTokens.id, tokenId));
  if (!row) {
    throw new ForgeError("NOT_FOUND", "GitHub token not found");
  }
  await db
    .update(githubTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(githubTokens.id, tokenId));
  return unseal(row.ciphertext);
}

function toSummary(row: TokenRow): GithubTokenSummary {
  return {
    id: row.id,
    name: row.name,
    hint: row.tokenHint,
    githubLogin: row.githubLogin,
    scopes: row.scopes,
    expiresAt: row.expiresAt?.getTime() ?? null,
    lastUsedAt: row.lastUsedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
  };
}
