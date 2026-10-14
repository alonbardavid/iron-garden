import { groupsOnServer } from "@lib/ai";
import { allows, authorize, ForgeError, requireUser } from "@lib/forge";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import {
  openFromGithubBranch,
  pullRequestsOnBranch,
  requireServerGrouping,
  type GithubBranchSource,
  type PullRequestDetail,
} from "@lib/review";
import { githubApi, type GithubApi } from "./api";
import { connectionOf } from "./connections";
import type { PullPayload } from "./payloads";
import { linkOf, requireConnection, sameRepository } from "./pulls";
import { connectionToken, syncConnection, type ConnectionRow } from "./sync";

const log = moduleLogger("github/from-github");

export interface GithubPullOption {
  number: number;
  title: string;
  branch: string;
  targetBranch: string;
  url: string;
  author: string | null;
}

export type OpenFromGithubSource =
  | { kind: "pull"; number: number }
  | { kind: "branch"; branch: string; targetBranch: string; title: string };

// Whether this person can open a pull request from GitHub here: they have
// Write, the repository is connected, and the server groups pull requests.
export async function canOpenFromGithub(
  principal: Principal,
  name: string,
): Promise<boolean> {
  const repository = await authorize(principal, name, "read");
  if (principal.kind !== "user" || !allows(repository.level, "write")) {
    return false;
  }
  const [connection, onServer] = await Promise.all([
    connectionOf(repository.id),
    groupsOnServer(),
  ]);
  const available = Boolean(connection) && onServer;
  log.info("opening from github checked", {
    repositoryId: repository.id,
    connected: Boolean(connection),
    onServer,
  });
  return available;
}

// The open GitHub pull requests from the repository's own branches that no
// open pull request here stands for yet.
export async function githubPullOptions(
  principal: Principal,
  name: string,
): Promise<GithubPullOption[]> {
  const { connection, api } = await connected(principal, name);
  const pulls = (await api.openPulls(connection.owner, connection.repo)).filter(
    (pull) => sameRepository(connection, pull),
  );
  const taken = await standingFor(connection.repositoryId, pulls);
  const options = pulls
    .filter((pull) => !taken.has(pull.number))
    .map((pull) => ({
      number: pull.number,
      title: pull.title,
      branch: pull.head.ref,
      targetBranch: pull.base.ref,
      url: pull.html_url,
      author: pull.user?.login ?? null,
    }));
  log.info("github pull requests listed", {
    connectionId: connection.id,
    open: pulls.length,
    offered: options.length,
  });
  return options;
}

// Opens a pull request here from a GitHub pull request, which it then stands
// for, or from a branch. Both branches are synced from GitHub first, and the
// server groups it.
export async function openFromGithub(
  principal: Principal,
  name: string,
  source: OpenFromGithubSource,
): Promise<PullRequestDetail> {
  const { connection, api } = await connected(principal, name);
  await requireServerGrouping();
  const branchSource =
    source.kind === "pull"
      ? await pullSource(connection, api, source.number)
      : { ...source, description: null, github: null };
  await syncConnection(connection, [
    branchSource.branch,
    branchSource.targetBranch,
  ]);
  return openFromGithubBranch(principal, name, branchSource);
}

async function connected(
  principal: Principal,
  name: string,
): Promise<{ connection: ConnectionRow; api: GithubApi }> {
  requireUser(principal);
  const repository = await authorize(principal, name, "write");
  const connection = await requireConnection(repository.id);
  return { connection, api: githubApi(await connectionToken(connection)) };
}

async function pullSource(
  connection: ConnectionRow,
  api: GithubApi,
  number: number,
): Promise<GithubBranchSource> {
  const pull = await api.pull(connection.owner, connection.repo, number);
  if (pull.state !== "open" || !sameRepository(connection, pull)) {
    log.info("open from github refused: pull request not usable", {
      connectionId: connection.id,
      githubNumber: number,
      state: pull.state,
    });
    throw new ForgeError(
      "BAD_REQUEST",
      `GitHub pull request #${number} is not open from a branch of ${connection.owner}/${connection.repo}`,
    );
  }
  return {
    branch: pull.head.ref,
    targetBranch: pull.base.ref,
    title: pull.title,
    description: pull.body ?? null,
    github: linkOf(pull),
  };
}

// The GitHub pull requests an open pull request here already stands for.
async function standingFor(
  repositoryId: string,
  pulls: PullPayload[],
): Promise<Set<number>> {
  const rows = (
    await Promise.all(
      [...new Set(pulls.map((pull) => pull.head.ref))].map((branch) =>
        pullRequestsOnBranch(repositoryId, branch),
      ),
    )
  ).flat();
  return new Set(
    rows.flatMap((row) =>
      row.githubNumber !== null &&
      (row.status === "open" || row.status === "processing")
        ? [row.githubNumber]
        : [],
    ),
  );
}
