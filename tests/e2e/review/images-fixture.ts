import { changesOf, diffLines } from "@lib/diff";
import { newEntityId } from "@lib/db-models/entity-ids";

// A pull request that changes a picture and an icon, seeded straight into
// the test database; the spec serves both versions of each file.
export const IMAGES_FIXTURE = {
  repository: "images-fixture",
  number: 1,
  png: {
    path: "assets/logo.png",
    // A 96×48 blue ellipse, then a 160×80 green one.
    before: {
      kind: "image",
      type: "image/png",
      bytes: 235,
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAYAAADuFn/PAAAAsklEQVR42u3bsQ2AMBADQO/EMOzf0SMkOpgC/IgrvICvSuJkP85LeokSAAAQAAAEAIB2lnV7Lb8HeLPsySj5c+ETQKL0LkYU34WI4rsQUXwXIorvQkT5XYQov4sQ5XcRovwuQpTfRQDwBQBlPocAAAAAAAAAAAAAAIKDGAAIU++CIAy4DYUw4D0AwoAXMQgD3oRBDFhF2AVZxlnG2YZaR1tH+x/gh4wfMgIAgAAAIAA+lRuwMiey/KiKKwAAAABJRU5ErkJggg==",
    },
    after: {
      kind: "image",
      type: "image/png",
      bytes: 389,
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAKAAAABQCAYAAACeXX40AAABTElEQVR42u3dwQ3CMBBE0emA0lII5SMkblAEgYm97/AbsN8pcnbzeL7eUqs4BAEoACUABaAEoACUABSAEoCFbvfj9JwrgD+BBSqAS0IDcyOAO4KbADLAAQkgcGNBBjoYAQRvLMRAB+NogCDMhhjw1IQY8NSEGPDUhBj41EQY8NSEGPjURBj41EQY+NREGPjURBj41EQY+NREGPjURAig1gXo8PUtQgC1JkCHrjMQAigABSB8qiAEUAAKQAAFoACEUD7DCEAAdW2AEMpjBM0GCKE8SNVsgBDC5684zf4rDkL4TEaQyQgQwmc6lkzHghA+E1J1aXhmRKuOz5R81eDZE6IqPJuSVIVnV5zsioNxJjr7gsEDEMa56JYECOQe4LYBCOSxxb1tA3ACyB3vaVuAK8OcdB/jADahOlcABaAEoACUABSAAlACUABKf+4DT0AnM8HMjb0AAAAASUVORK5CYII=",
    },
  },
  svg: {
    path: "assets/icon.svg",
    before:
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">\n  <circle cx="24" cy="24" r="20" fill="#3357E8"/>\n</svg>\n',
    after:
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">\n  <rect x="4" y="4" width="40" height="40" rx="8" fill="#0F6B4F"/>\n</svg>\n',
  },
};

const sql = (value: unknown) =>
  `'${(typeof value === "string" ? value : JSON.stringify(value)).replace(/'/g, "''")}'`;

export function buildImagesFixtureSql(): string {
  const f = IMAGES_FIXTURE;
  const repositoryId = newEntityId("REPOSITORY");
  const pullRequestId = newEntityId("PULL_REQUEST");
  const svgKeys = changesOf(diffLines(f.svg.before, f.svg.after)).map((c) => [
    c.key,
    c.at,
  ]);
  const file = (path: string, lines: number, changes: unknown[]) =>
    `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${pullRequestId}', '${path}', 'modified', ${lines}, ${lines}, ${sql(changes)});`;
  return [
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}');`,
    `INSERT INTO pull_requests (id, repository_id, number, title, branch, target_branch, base_commit, head_commit, status) VALUES ('${pullRequestId}', '${repositoryId}', ${f.number}, 'A new logo', 'logo', 'main', '${"a".repeat(40)}', '${"b".repeat(40)}', 'open');`,
    file(f.png.path, 0, []),
    file(f.svg.path, 3, svgKeys),
  ].join("\n");
}
