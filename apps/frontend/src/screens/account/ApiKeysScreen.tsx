import { useQueryClient } from "@tanstack/react-query";
import { KeysCard } from "../../components/keys/KeysCard";
import { orpc } from "../../logic/api/orpc";
import { nextPage, usePagedList } from "../../logic/api/paging";
import { useSignedInMe } from "../../logic/authentication/useMe";
import { SkeletonCards } from "../../components/skeletons";

export const ApiKeysScreen = () => {
  const me = useSignedInMe();
  const queryClient = useQueryClient();
  const list = usePagedList(
    orpc.keys.list.infiniteOptions({
      input: (cursor) => ({ cursor }),
      ...nextPage,
    }),
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.keys.key() });
  if (!list.items) {
    return <SkeletonCards count={1} />;
  }
  return (
    <KeysCard
      keys={list.items}
      list={list}
      gitUser={me.username ?? me.email}
      description="A key is the password git asks for, and authenticates scripts that call the API. Create one per machine."
      onCreate={async (input) => {
        const created = await orpc.keys.create.call(input);
        await refresh();
        return created.plaintext;
      }}
      onRevoke={async (id) => {
        await orpc.keys.revoke.call({ id });
        await refresh();
      }}
    />
  );
};
