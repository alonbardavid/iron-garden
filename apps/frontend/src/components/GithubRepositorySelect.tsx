import { useQuery } from "@tanstack/react-query";
import type { GithubTokenRepository } from "@lib/contract";
import { useFormContext } from "@lib/ds";
import { orpc } from "../logic/api/orpc";
import { errorMessage } from "../logic/api/errors";
import { FormSearchSelect } from "./SearchSelect";

// A form's `repository` field ("owner/repo"): one of the GitHub repositories
// the token in its `tokenId` field can reach. Picking another token clears it.
export const GithubRepositorySelect = () => {
  const form = useFormContext();
  form.watch("tokenId", () => form.setFieldValue("repository", ""));
  const tokenId = String(form.values.tokenId ?? "");
  // The select's first search, read here too for GitHub's refusal.
  const { isFetching, error } = useQuery({
    ...orpc.githubTokens.repositories.queryOptions({
      input: { id: tokenId, q: "" },
    }),
    enabled: tokenId !== "",
  });
  return (
    <FormSearchSelect
      // A new token starts a new search.
      key={tokenId}
      name="repository"
      label="GitHub repository"
      disabled={tokenId === ""}
      search={(q) =>
        orpc.githubTokens.repositories.queryOptions({
          input: { id: tokenId, q },
        })
      }
      toOption={toOption}
      nothingFoundMessage="The token reaches no repository by that name"
      placeholder={placeholder(tokenId, isFetching)}
      description={
        error
          ? errorMessage(error)
          : "The repositories this token can reach, most recently pushed first."
      }
    />
  );
};

function placeholder(tokenId: string, loading: boolean): string {
  if (tokenId === "") {
    return "Pick a token first";
  }
  return loading ? "Loading repositories…" : "Search repositories";
}

function toOption(repository: GithubTokenRepository) {
  const fullName = `${repository.owner}/${repository.repo}`;
  return {
    value: fullName,
    label: repository.private ? `${fullName} (private)` : fullName,
  };
}
