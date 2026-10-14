import {
  getGitHost,
  GitHostError,
  gitServiceOf,
  proxyGit,
} from "@lib/git-host";
import { principalForKey, apiKeyFrom } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { ForgeError } from "./errors";
import { authorize, requireGit } from "./repositories";

const log = moduleLogger("forge/git-proxy");

// Long enough for a big clone or push to finish; the token never leaves the
// Worker.
const PROXY_TOKEN_TTL_SECONDS = 15 * 60;

const CHALLENGE = { "www-authenticate": 'Basic realm="iron-garden"' };

// Git smart HTTP for /<name>.git/<path>: Basic auth with an API key as the
// password, Read to fetch and Write to push, then streamed to the
// repository's Artifacts remote with a token minted for this request.
export async function serveGit(
  request: Request,
  name: string,
  path: string,
): Promise<Response> {
  const url = new URL(request.url);
  const service = gitServiceOf(path, url.searchParams);
  if (!service) {
    return text(404, "Not a git endpoint");
  }
  const key = apiKeyFrom(request.headers);
  if (!key) {
    return text(401, "Authentication required", CHALLENGE);
  }
  const principal = await principalForKey(key);
  if (!principal) {
    return text(
      401,
      "Use an API key as the password, not your account password. Create one under Account > API keys.",
      CHALLENGE,
    );
  }
  const action = service === "git-receive-pack" ? "write" : "read";
  try {
    requireGit();
    const repository = await authorize(principal, name, action);
    const git = getGitHost();
    const [remote, { token }] = await Promise.all([
      git.remote(repository.artifactsName),
      git.token(repository.artifactsName, action, PROXY_TOKEN_TTL_SECONDS),
    ]);
    log.info("git request proxied", {
      repositoryId: repository.id,
      service,
      userId: principal.userId,
    });
    return await proxyGit(request, remote, path, token);
  } catch (err) {
    if (err instanceof ForgeError) {
      const status =
        err.code === "NOT_FOUND" ? 404 : err.code === "UNAVAILABLE" ? 503 : 403;
      return text(status, err.message);
    }
    if (err instanceof GitHostError) {
      const status =
        err.code === "NOT_FOUND" ? 404 : err.code === "UNAVAILABLE" ? 503 : 502;
      return text(status, err.message);
    }
    throw err;
  }
}

// Git clients print a plain-text body to the user.
function text(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(`${body}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...headers },
  });
}
