# Git engine

> **Status: fallback.** Git storage is Cloudflare Artifacts ([architecture.md](./architecture.md)).
> This engine is built only if a deployment needs a storage backend other than Artifacts.

The git engine is the hardest and riskiest part of IronGarden, so it is built and proven
first (Phases 1–2 in [plan.md](./plan.md)). It has two layers:

- **`libs/git-core`**: pure TypeScript, no Cloudflare imports. Testable in Node against
  fixtures produced by real git.
- **`libs/git-storage`**: the `RepoStore` interface and its Cloudflare implementation (Repo
  Durable Object + R2).

## Protocol support (v1)

| Capability     | Support                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Transport      | Smart HTTP only (`info/refs`, `git-upload-pack`, `git-receive-pack`). No dumb HTTP, no SSH, no `git://`             |
| Fetch protocol | v2 (`ls-refs`, `fetch`) preferred; v0 fallback for older clients                                                    |
| Push protocol  | v0/v1 receive-pack (git has no v2 push) with `report-status`, `side-band-64k`, `atomic`, `delete-refs`, `ofs-delta` |
| Shallow        | `deepen` (depth) in v1; `deepen-since` / `deepen-not` later                                                         |
| Object format  | SHA-1 only. SHA-256 repos later                                                                                     |
| Not in v1      | Partial clone (`filter`), bundle URIs, push options, LFS                                                            |

## git-core modules

- `objects`: parse and serialize blob, tree, commit, tag; SHA-1 via `crypto.subtle`.
- `pktline`: pkt-line reader and writer over streams, including flush, delim and
  response-end packets.
- `pack`: streaming pack reader (yields each entry with its offset, type, size and the number
  of compressed bytes it used) and streaming pack writer.
- `delta`: apply `ofs-delta` / `ref-delta`; create deltas for repacking.
- `inflate`: zlib inflate that reports consumed input bytes. The platform
  `DecompressionStream` does not, so this is chosen in Phase 0 Spike B.
- `protocol`: upload-pack v0/v2 and receive-pack state machines over a `RepoStore`.
- `walk`: commit-graph traversal, reachability, merge-base.
- `diff`: tree diff and line diff (for the UI and change requests).
- `merge`: three-way tree merge plus diff3 for files changed on both sides; returns either a
  tree or a list of conflicts.

## RepoStore interface

```ts
interface RepoStore {
  listRefs(prefix?: string): Promise<Ref[]>;
  updateRefs(updates: RefUpdate[]): Promise<RefUpdateResult[]>; // atomic compare-and-swap
  readObject(oid: string): Promise<GitObject | null>;
  hasObjects(oids: string[]): Promise<Set<string>>;
  ingestPack(pack: ReadableStream<Uint8Array>): Promise<IngestResult>;
  streamPack(oids: Iterable<string>): ReadableStream<Uint8Array>;
  commitInfo(oid: string): Promise<CommitInfo | null>; // parents, tree, dates from the graph cache
}
```

An in-memory implementation backs git-core tests; the Durable Object implementation backs
production. A Cloudflare Artifacts implementation can be added later.

## Durable Object storage

One Durable Object per repository, addressed by repo id (`idFromName(repoId)`), with SQLite
storage:

| Table     | Columns                                                                        | Purpose                                                 |
| --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `refs`    | `name` PK, `oid`, `updated_at`                                                 | Branches, tags, `HEAD` (symbolic)                       |
| `packs`   | `id` PK, `r2_key`, `object_count`, `size`, `created_at`, `state`               | Packs in R2 (`state`: ingesting, live, retired)         |
| `objects` | `oid` PK, `pack_id`, `offset`, `type`, `size`, `base_oid`                      | Object index; `base_oid` set for deltas                 |
| `commits` | `oid` PK, `tree`, `parents` (JSON), `author_time`, `commit_time`, `generation` | Commit-graph cache for negotiation, logs and merge-base |

R2 layout: `repos/<repoId>/packs/<packId>.pack` and `.idx` (standard git idx v2, so a pack can
be exported or debugged with real git).

## Push ingestion

1. Parse ref update commands; reject early on permission or branch-rule violations that do not
   need objects (e.g. pushing to a protected branch without rights).
2. Stream the pack body to an R2 multipart upload while parsing it entry by entry.
3. For each entry, record offset and compressed length; for base objects hash immediately; for
   deltas resolve against already-indexed bases (in this pack or earlier packs).
4. Check connectivity: every new ref tip reaches only objects that exist.
5. Evaluate branch rules that need objects (no force-push = new tip must descend from old tip).
6. In one SQLite transaction: insert index rows, mark the pack live, compare-and-swap refs.
7. Report status per ref; enqueue a push job (diff analysis, rules, collaboration checks, webhooks).

Long ingestions continue across Durable Object alarms if a single request would exceed CPU
limits.

## Fetch

1. `ls-refs`: read `refs`.
2. Negotiate with `have`/`want`, using `commits.generation` to stop walking early.
3. Compute the object set (commits, then trees and blobs not reachable from haves).
4. Stream the pack: reuse stored entries byte-for-byte when their base is also being sent,
   otherwise send the full object. Use `side-band-64k` for progress.

## Maintenance

A DO alarm repacks when a repo has more than N live packs (initially 20): writes one new pack,
swaps the index in a transaction, retires the old packs, and deletes them from R2 after a grace
period. Unreachable objects are dropped during repack after 14 days.

## Testing

Fixture repos, test layers and the git version matrix are specified in
[testing.md](./testing.md). In short: every git-core module is unit-tested against fixture
bundles built by real git, and every protocol path is proven with the real `git` binary,
first against a Node harness (Phase 1), then against `vite dev` and a real preview deploy
(Phase 1).
