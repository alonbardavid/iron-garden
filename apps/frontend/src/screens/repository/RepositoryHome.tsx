import { Navigate, useSearchParams } from "react-router-dom";
import { withQuery } from "../../logic/url";
import { SessionsScreen } from "../sessions/SessionsScreen";
import { useRepository } from "./RepositoryLayout";

// A repository opens on its sessions. A code link from before code moved to
// /code carries a ref or path, and still opens that code.
export const RepositoryHome = () => {
  const { name } = useRepository();
  const [search] = useSearchParams();
  return search.has("ref") || search.has("path") ? (
    <Navigate
      to={withQuery(`/r/${name}/code`, Object.fromEntries(search))}
      replace
    />
  ) : (
    <SessionsScreen />
  );
};
