import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import type { ListPage } from "@lib/contract";

// Spread into an `infiniteOptions` call: a paged list starts with no cursor
// and asks for the next page with the one the last page handed back.
export const nextPage = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page: { nextCursor: string | null }) =>
    page.nextCursor ?? undefined,
};

type PagedQuery<Item> = Parameters<
  typeof useInfiniteQuery<
    ListPage<Item>,
    Error,
    InfiniteData<ListPage<Item>, string | undefined>,
    readonly unknown[],
    string | undefined
  >
>[0];

// A paged list's rows so far, read a page at a time; `items` stays undefined
// until the first page arrives.
export function usePagedList<Item>(options: PagedQuery<Item>) {
  const query = useInfiniteQuery(options);
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items),
  };
}

export type PagedList = Pick<
  ReturnType<typeof usePagedList>,
  "hasNextPage" | "isFetchingNextPage" | "fetchNextPage"
>;
