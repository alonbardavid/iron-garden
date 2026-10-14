const FORWARDED_HEADERS = [
  "accept",
  "accept-encoding",
  "content-encoding",
  "content-type",
  "git-protocol",
  "user-agent",
];

export const GIT_SERVICES = ["git-upload-pack", "git-receive-pack"] as const;
export type GitService = (typeof GIT_SERVICES)[number];

// The git smart HTTP service a request is for, or null for anything else.
// `info/refs` names it in the query; the RPC calls in the path.
export function gitServiceOf(
  path: string,
  query: URLSearchParams,
): GitService | null {
  if (path === "/info/refs") {
    const service = query.get("service");
    return GIT_SERVICES.find((name) => name === service) ?? null;
  }
  return GIT_SERVICES.find((name) => path === `/${name}`) ?? null;
}

// Streams one git smart HTTP request to a repository's remote with a token the
// caller minted for it. Only git's own headers travel; the caller's
// credentials never leave the Worker.
export async function proxyGit(
  request: Request,
  remote: string,
  path: string,
  token: string,
): Promise<Response> {
  const target = new URL(`${remote.replace(/\/$/, "")}${path}`);
  target.search = new URL(request.url).search;
  const headers = new Headers({ authorization: `Bearer ${token}` });
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" ? undefined : request.body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: pick(upstream.headers, [
      "content-type",
      "content-encoding",
      "cache-control",
    ]),
  });
}

function pick(source: Headers, names: string[]): Headers {
  const headers = new Headers();
  for (const name of names) {
    const value = source.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}
