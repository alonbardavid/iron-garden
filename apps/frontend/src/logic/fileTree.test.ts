import { describe, expect, it } from "vitest";
import { fileTree, treeFiles } from "./fileTree";

const paths = [
  "web/src/api/invoices.ts",
  "pnpm-lock.yaml",
  "api/src/routes/invoices.ts",
  "packages/metering/src/index.ts",
  "api/openapi.yaml",
  "packages/metering/package.json",
  "packages/metering/src/lib/rates.ts",
];

describe("fileTree", () => {
  it("nests changed files by folder, merging folders that change no file directly", () => {
    expect(fileTree(paths)).toEqual({
      folders: [
        {
          name: "api",
          path: "api",
          folders: [
            {
              name: "src/routes",
              path: "api/src/routes",
              folders: [],
              files: [
                { path: "api/src/routes/invoices.ts", name: "invoices.ts" },
              ],
            },
          ],
          files: [{ path: "api/openapi.yaml", name: "openapi.yaml" }],
        },
        {
          name: "packages/metering",
          path: "packages/metering",
          folders: [
            {
              name: "src",
              path: "packages/metering/src",
              folders: [
                {
                  name: "lib",
                  path: "packages/metering/src/lib",
                  folders: [],
                  files: [
                    {
                      path: "packages/metering/src/lib/rates.ts",
                      name: "rates.ts",
                    },
                  ],
                },
              ],
              files: [
                { path: "packages/metering/src/index.ts", name: "index.ts" },
              ],
            },
          ],
          files: [
            { path: "packages/metering/package.json", name: "package.json" },
          ],
        },
        {
          name: "web/src/api",
          path: "web/src/api",
          folders: [],
          files: [{ path: "web/src/api/invoices.ts", name: "invoices.ts" }],
        },
      ],
      files: [{ path: "pnpm-lock.yaml", name: "pnpm-lock.yaml" }],
    });
  });

  it("lists files in tree order, each folder's subfolders before its files", () => {
    expect(treeFiles(fileTree(paths))).toEqual([
      "api/src/routes/invoices.ts",
      "api/openapi.yaml",
      "packages/metering/src/lib/rates.ts",
      "packages/metering/src/index.ts",
      "packages/metering/package.json",
      "web/src/api/invoices.ts",
      "pnpm-lock.yaml",
    ]);
  });
});
