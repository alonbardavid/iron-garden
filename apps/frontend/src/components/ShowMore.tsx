import { Button, Group } from "@mantine/core";
import type { PagedList } from "../logic/api/paging";

// Reads a paged list's next page; nothing once the last page is in.
export const ShowMore = ({ list }: { list: PagedList }) =>
  list.hasNextPage ? (
    <Group justify="center" py={8}>
      <Button
        variant="default"
        size="xs"
        loading={list.isFetchingNextPage}
        onClick={() => void list.fetchNextPage()}
      >
        Show more
      </Button>
    </Group>
  ) : null;
