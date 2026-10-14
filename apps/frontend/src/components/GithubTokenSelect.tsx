import { Anchor } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FormSelect } from "@lib/ds";
import { orpc } from "../logic/api/orpc";

// A form's `tokenId` field: one of the signed-in user's GitHub tokens.
export const GithubTokenSelect = () => {
  const { data: tokens } = useQuery(orpc.githubTokens.list.queryOptions());
  return (
    <FormSelect
      name="tokenId"
      label="GitHub token"
      data={(tokens ?? []).map((token) => ({
        value: token.id,
        label: `${token.name} (${token.githubLogin})`,
      }))}
      placeholder={tokens?.length === 0 ? "No tokens yet" : "Pick one of yours"}
      description={
        <>
          Your tokens are under{" "}
          <Anchor component={Link} to="/account/github-tokens" size="xs">
            Account › GitHub tokens
          </Anchor>
          .
        </>
      }
    />
  );
};
