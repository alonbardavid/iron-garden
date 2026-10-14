import { z } from "zod";

export const fileVersionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("binary"), bytes: z.number() }),
  z.object({ kind: z.literal("too-large"), bytes: z.number() }),
]);
export type FileVersion = z.infer<typeof fileVersionSchema>;

export const PATH_ENTRY_TYPES = [
  "directory",
  "file",
  "symlink",
  "submodule",
] as const;

export const pathEntrySchema = z.object({
  name: z.string(),
  type: z.enum(PATH_ENTRY_TYPES),
});
export type PathEntry = z.infer<typeof pathEntrySchema>;

// A file as the code browser shows it: a raster image comes as its bytes.
export const pathFileSchema = z.discriminatedUnion("kind", [
  ...fileVersionSchema.options,
  z.object({
    kind: z.literal("image"),
    type: z.string(),
    base64: z.string(),
    bytes: z.number(),
  }),
]);
export type PathFile = z.infer<typeof pathFileSchema>;

// What a path in a repository names at a commit: a directory's entries,
// directories first, or a file.
export const pathContentsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("directory"), entries: z.array(pathEntrySchema) }),
  z.object({ kind: z.literal("file"), file: pathFileSchema }),
]);
export type PathContents = z.infer<typeof pathContentsSchema>;

export const branchInfoSchema = z.object({
  name: z.string(),
  commit: z.string(),
  isDefault: z.boolean(),
});
export type BranchInfo = z.infer<typeof branchInfoSchema>;

export const commitSchema = z.object({
  hash: z.string(),
  message: z.string(),
  author: z.string(),
  // Epoch milliseconds.
  committedAt: z.number(),
  parents: z.array(z.string()),
});
export type Commit = z.infer<typeof commitSchema>;

// The most commits one page of history holds.
export const MAX_COMMITS_PAGE = 100;

// A full commit hash.
export const commitHashSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/, { error: "Use a full commit hash" });

export const FILE_CHANGES = ["added", "modified", "deleted"] as const;

// A file a change touches, with its line count on each side.
export const changedFileSchema = z.object({
  path: z.string(),
  change: z.enum(FILE_CHANGES),
  oldLines: z.number(),
  newLines: z.number(),
});
export type ChangedFile = z.infer<typeof changedFileSchema>;

// A changed file before and after the change; a side is null when the file
// is added or deleted.
export const changedFileContentsSchema = z.object({
  path: z.string(),
  before: pathFileSchema.nullable(),
  after: pathFileSchema.nullable(),
});

// A commit and the files it changes against its first parent; a root
// commit adds every file it has.
export const commitDetailSchema = z.object({
  commit: commitSchema,
  files: z.array(changedFileSchema),
});
export type CommitDetail = z.infer<typeof commitDetailSchema>;
