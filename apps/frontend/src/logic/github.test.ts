import { describe, expect, it } from "vitest";
import { parseGithubRepository } from "./github";

describe("parseGithubRepository", () => {
  it.each([
    "acme/web",
    " acme/web ",
    "https://github.com/acme/web",
    "https://github.com/acme/web/",
    "github.com/acme/web.git",
    "git@github.com:acme/web.git",
  ])("reads %s", (input) => {
    expect(parseGithubRepository(input)).toEqual({
      owner: "acme",
      repo: "web",
    });
  });

  it.each(["acme", "https://gitlab.com/acme/web", "acme/web/tree/main", ""])(
    "refuses %s",
    (input) => {
      expect(parseGithubRepository(input)).toBeNull();
    },
  );
});
