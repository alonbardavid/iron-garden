// What every sandboxed processor shares: the chat it has with the model, the
// repository it may read, and how the model asks to read it. Runs inside the
// sandbox, so it imports nothing at runtime.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Which side of the pull request to read: the target branch where the branch
// leaves it, or the branch's head.
export type RepositoryVersion = "base" | "head";

export type RepositoryFile =
  | { kind: "text"; text: string; lines: number; truncated: boolean }
  | { kind: "binary" | "too-large"; bytes: number };

/**
 * The repository the pull request's commits are in, read-only and only at
 * the pull request's two commits.
 */
export interface SessionRepository {
  // Every file path under `directory` ("" for all), and whether the list was
  // cut short.
  list(
    version: RepositoryVersion,
    directory: string,
  ): Promise<{ paths: string[]; truncated: boolean }>;
  // Null when the version has no such file.
  read(
    version: RepositoryVersion,
    path: string,
  ): Promise<RepositoryFile | null>;
}

export type RepositoryRequest =
  | { list: RepositoryVersion; under: string }
  | { read: string; at: RepositoryVersion };

// Turns the model may spend reading the repository, and requests per turn.
export const MAX_READ_TURNS = 8;
export const MAX_REQUESTS_PER_TURN = 10;

// The JSON object in a model's reply, which may come wrapped in a code fence
// or a sentence despite being asked not to; a string says what is wrong.
export function jsonObjectOf(text: string): Record<string, unknown> | string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) {
    return "The answer has no JSON object";
  }
  try {
    return (JSON.parse(text.slice(start, end + 1)) ?? {}) as Record<
      string,
      unknown
    >;
  } catch (err) {
    return `The answer is not valid JSON: ${(err as Error).message}`;
  }
}

// The reads a reply asks for, up to MAX_REQUESTS_PER_TURN; a string when
// none of them can be carried out.
export function requestsOf(requests: unknown[]): RepositoryRequest[] | string {
  const valid: RepositoryRequest[] = [];
  for (const request of requests.slice(0, MAX_REQUESTS_PER_TURN)) {
    const {
      read,
      list,
      at = "head",
      under = "",
    } = (request ?? {}) as Record<string, unknown>;
    if (at !== "base" && at !== "head") {
      continue;
    }
    if (typeof read === "string") {
      valid.push({ read, at });
    } else if (
      (list === "base" || list === "head") &&
      typeof under === "string"
    ) {
      valid.push({ list, under });
    }
  }
  return valid.length > 0
    ? valid
    : 'Each request is { "read": "<path>", "at": "base" | "head" } or { "list": "base" | "head", "under": "<directory>" }';
}

// The repository's answers to a turn's requests, as one message ending with
// `next`, what the model does now.
export async function fulfil(
  repository: SessionRepository,
  requests: RepositoryRequest[],
  next: string,
): Promise<string> {
  const answers = await Promise.all(
    requests.map(async (request) =>
      "read" in request
        ? fileSection(request, await repository.read(request.at, request.read))
        : listSection(
            request,
            await repository.list(request.list, request.under),
          ),
    ),
  );
  return `${answers.join("\n\n")}\n\n${next}`;
}

function fileSection(
  request: { read: string; at: RepositoryVersion },
  file: RepositoryFile | null,
): string {
  const heading = `### ${request.read} at ${request.at}`;
  if (!file) {
    return `${heading}\n(no such file)`;
  }
  if (file.kind !== "text") {
    return `${heading}\n(${file.kind === "binary" ? "binary" : "too large"}, ${file.bytes} bytes)`;
  }
  const numbered = file.text
    .split("\n")
    .slice(0, file.lines)
    .map((line, i) => `${String(i + 1).padStart(5)}  ${line}`)
    .join("\n");
  return `${heading} (${file.lines} lines${file.truncated ? ", cut short" : ""})\n${numbered}`;
}

function listSection(
  request: { list: RepositoryVersion; under: string },
  listing: { paths: string[]; truncated: boolean },
): string {
  const heading = `### Files under ${request.under || "/"} at ${request.list}`;
  const paths = listing.paths.length > 0 ? listing.paths.join("\n") : "(none)";
  return `${heading}${listing.truncated ? " (cut short)" : ""}\n${paths}`;
}
