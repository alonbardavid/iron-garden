import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";

// Serves each local repository the way a smart HTTP server would, with the
// real git binary behind it: https://git.test/<dir name>.git/...
export function gitServer(root: string) {
  const requests: string[] = [];
  const fetcher = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const [, repo, ...rest] = url.pathname.split("/");
    const dir = join(root, repo!.replace(/\.git$/, ""));
    const path = rest.join("/");
    requests.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "info/refs") {
      const service = url.searchParams.get("service")!;
      const refs = await run(service, [
        "--stateless-rpc",
        "--advertise-refs",
        dir,
      ]);
      const header = pkt(`# service=${service}\n`);
      return new Response(Buffer.concat([Buffer.from(`${header}0000`), refs]));
    }
    const body = Buffer.from(await new Response(init!.body).arrayBuffer());
    return new Response(await run(path, ["--stateless-rpc", dir], body));
  };
  return { fetcher, requests };
}

function run(service: string, args: string[], stdin?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [service.replace(/^git-/, ""), ...args]);
    const out: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`${service} exited ${code}`)),
    );
    child.stdin.end(stdin);
  });
}

function pkt(payload: string): string {
  return (payload.length + 4).toString(16).padStart(4, "0") + payload;
}

export const remote = (name: string) => ({
  url: `https://git.test/${name}.git`,
  authorization: "Bearer test",
});

// Runs git in one of the repositories under root, as a fixed author.
export function gitIn(root: () => string) {
  return (dir: string, ...args: string[]) =>
    execFileSync("git", ["-C", join(root(), dir), ...args], {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    })
      .toString()
      .trim();
}
