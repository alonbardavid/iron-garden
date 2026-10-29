import { Anchor } from "@mantine/core";
import { Link } from "react-router-dom";
import type { GithubToken } from "@lib/contract";
import { orpc } from "../logic/api/orpc";
import { FormSearchSelect } from "./SearchSelect";

// A form's `tokenId` field: one of the signed-in user's GitHub tokens, found
// by name or GitHub login.
export const GithubTokenSelect = () => (
  <FormSearchSelect
    name="tokenId"
    label="GitHub token"
    search={(q) => orpc.githubTokens.search.queryOptions({ input: { q } })}
    toOption={toOption}
    placeholder="Search your tokens"
    nothingFoundMessage="None of your tokens matches"
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

function toOption(token: GithubToken) {
  return { value: token.id, label: `${token.name} (${token.githubLogin})` };
}
