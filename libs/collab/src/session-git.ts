import { waitUntil } from "cloudflare:workers";
import { getBindings } from "@lib/capabilities";
import { getDb, agentSessions, eq } from "@lib/db-models";
import {
  getGitHost,
  gitServiceOf,
  proxyGit,
  pushedBranches,
  type PushedBranch,
} from "@lib/git-host";
import { moduleLogger } from "@lib/logging";
import { touchSession } from "./sessions";
import { recordBranchHead, releasePushedBranch } from "./working-set";

const log = moduleLogger("collab/session-git");

const CHALLENGE = { "www-authenticate": 'Basic realm="session"' };

type SessionForGit = {
  id: string;
  repositoryId: string;
  artifactsName: string;
  baseCommit: string | null;
};

// Git smart HTTP for /<sessionId>.git/<path>: the session repository, with
// the session's own git token passed through for Artifacts to check, so this
// adds no credential of its own. A push is read on the way through: once it
// lands, the branches it moved are recorded in the session's working set.
export async function serveSessionGit(
  request: Request,
  sessionId: string,
  path: string,
): Promise<Response> {
  const service = gitServiceOf(path, new URL(request.url).searchParams);
  if (!service) {
    return text(404, "Not a git endpoint");
  }
  const token = tokenFrom(request.headers);
  if (!token) {
    return text(401, "Use the session's git token", CHALLENGE);
  }
  if (!getBindings().git) {
    return text(503, "Git hosting is not set up on this server");
  }
  const session = await sessionForGit(sessionId);
  if (!session) {
    return text(404, "No such session");
  }
  const remote = await getGitHost().remote(session.artifactsName);
  log.info("session git request proxied", { sessionId, service });
  return service === "git-receive-pack" && request.body
    ? proxyPush(request, session, { remote, path, token })
    : proxyGit(request, remote, path, token);
}

// Forwards a push while reading the branch updates in front of its pack.
async function proxyPush(
  request: Request,
  session: SessionForGit,
  target: { remote: string; path: string; token: string },
): Promise<Response> {
  const [commands, pack] = request.body!.tee();
  const pushed = pushedBranches(commands);
  const upstream = await proxyGit(
    new Request(request, { body: pack }),
    target.remote,
    target.path,
    target.token,
  );
  return upstream.ok
    ? afterResponse(upstream, async () => record(session, await pushed))
    : upstream;
}

// The session token, sent as a bearer token or as the Basic password.
function tokenFrom(headers: Headers): string | null {
  const header = headers.get("authorization") ?? "";
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() === "bearer" && value) {
    return value;
  }
  if (scheme?.toLowerCase() === "basic" && value) {
    const decoded = atob(value);
    return decoded.slice(decoded.indexOf(":") + 1) || null;
  }
  return null;
}

async function sessionForGit(sessionId: string): Promise<SessionForGit | null> {
  const [row] = await getDb()
    .select({
      id: agentSessions.id,
      repositoryId: agentSessions.repositoryId,
      artifactsName: agentSessions.artifactsName,
      baseCommit: agentSessions.baseCommit,
    })
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionId));
  return row ?? null;
}

// Passes the answer on, then runs `after` once git has read all of it: the
// refs have moved by then.
function afterResponse(
  upstream: Response,
  after: () => Promise<void>,
): Response {
  const { readable, writable } = new TransformStream<Uint8Array>();
  waitUntil(
    upstream
      .body!.pipeTo(writable)
      .then(after)
      .catch((err: unknown) => {
        log.warn("pushed branches not recorded", { err });
      }),
  );
  return new Response(readable, upstream);
}

async function record(session: SessionForGit, pushed: PushedBranch[]) {
  await touchSession(session.id);
  for (const { branch, deleted } of pushed) {
    await (deleted
      ? releasePushedBranch(session.id, branch)
      : recordBranchHead(session, branch));
  }
  log.info("session push recorded", {
    sessionId: session.id,
    branches: pushed.length,
  });
}

// Git clients print a plain-text body to the user.
function text(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...headers },
  });
}
