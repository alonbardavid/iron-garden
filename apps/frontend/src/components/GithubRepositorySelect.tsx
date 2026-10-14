import { useQuery } from "@tanstack/react-query";
import type { GithubTokenRepository } from "@lib/contract";
import { FormSelect, useFormContext } from "@lib/ds";
import { orpc } from "../logic/api/orpc";
import { errorMessage } from "../logic/api/errors";

// A form's `repository` field ("owner/repo"): one of the GitHub repositories
// the token in its `tokenId` field can reach. Picking another token clears it.
export const GithubRepositorySelect = () => {
  const form = useFormContext();
  form.watch("tokenId", () => form.setFieldValue("repository", ""));
  const tokenId = String(form.values.tokenId ?? "");
  const { data, isFetching, error } = useQuery({
    ...orpc.githubTokens.repositories.queryOptions({ input: { id: tokenId } }),
    enabled: tokenId !== "",
  });
  return (
    <FormSelect
      name="repository"
      label="GitHub repository"
      searchable
      disabled={tokenId === ""}
      nothingFoundMessage="The token reaches no repository by that name"
      data={(data ?? []).map(toOption)}
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
