import { Badge, Button, Group, Menu, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LIST_DEFAULT_LIMIT, type ListPage } from "@lib/contract";
import { Card } from "../../components/Card";
import { ShowMore } from "../../components/ShowMore";
import { nextPage, usePagedList } from "../../logic/api/paging";
import { authClient } from "../../logic/authentication/client";
import { useSignedInMe } from "../../logic/authentication/useMe";
import { NewUserModal } from "./NewUserModal";
import {
  TemporaryPasswordModal,
  temporaryPassword,
} from "./TemporaryPasswordModal";
import { SkeletonRows } from "../../components/skeletons";
import { palette } from "@lib/ds";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  role?: string | null;
  banned?: boolean | null;
  mustChangePassword?: boolean | null;
  invited?: boolean | null;
}

const USERS_KEY = ["admin", "users"];

export const UsersScreen = () => {
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const users = usePagedList({
    queryKey: USERS_KEY,
    queryFn: ({ pageParam }) => listUsers(Number(pageParam ?? 0)),
    ...nextPage,
  });
  return (
    <Card
      title={
        <Group justify="space-between">
          Users
          <Button onClick={() => setCreating(true)}>New user</Button>
        </Group>
      }
    >
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>User</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(users.items ?? []).map((user) => (
            <UserRow key={user.id} user={user} onPassword={setShown} />
          ))}
        </Table.Tbody>
      </Table>
      {!users.items && <SkeletonRows rows={4} />}
      <ShowMore list={users} />
      <NewUserModal
        opened={creating}
        onClose={() => setCreating(false)}
        onCreated={({ username, email, password }) => {
          setCreating(false);
          if (password) {
            setShown({ username, password });
          } else {
            notifications.show({ message: `Invite sent to ${email}` });
          }
        }}
      />
      <TemporaryPasswordModal shown={shown} onClose={() => setShown(null)} />
    </Card>
  );
};

// A page of users by name; better-auth pages by offset, which is the cursor.
async function listUsers(offset: number): Promise<ListPage<AdminUser>> {
  const { data, error } = await authClient.admin.listUsers({
    query: { limit: LIST_DEFAULT_LIMIT, offset, sortBy: "name" },
  });
  if (error) {
    throw new Error(error.message ?? "Could not list users");
  }
  const next = offset + data.users.length;
  return {
    items: data.users as AdminUser[],
    nextCursor: next < data.total ? String(next) : null,
    total: { count: data.total, capped: false },
  };
}

const UserRow = ({
  user,
  onPassword,
}: {
  user: AdminUser;
  onPassword: (shown: { username: string; password: string }) => void;
}) => {
  const me = useSignedInMe();
  const queryClient = useQueryClient();
  const act = async (
    change: () => Promise<{ error: { message?: string } | null }>,
    done?: () => void,
  ) => {
    const { error } = await change();
    if (error) {
      notifications.show({
        color: "red",
        message: error.message ?? "Something went wrong",
      });
      return;
    }
    done?.();
    await queryClient.invalidateQueries({ queryKey: USERS_KEY });
  };
  const resetPassword = () => {
    const password = temporaryPassword();
    return act(
      () =>
        authClient.admin.setUserPassword({
          userId: user.id,
          newPassword: password,
        }),
      () => onPassword({ username: user.username ?? user.email, password }),
    );
  };
  const isAdmin = user.role === "admin";
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={600}>
          {user.name}{" "}
          {user.id === me.id && (
            <Text span size="xs" c="dimmed" fw={400}>
              you
            </Text>
          )}
        </Text>
        <Text size="xs" c="dimmed">
          {user.username} · {user.email}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" tt="capitalize">
          {user.role ?? "user"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Status user={user} />
      </Table.Td>
      <Table.Td ta="right">
        <Menu position="bottom-end">
          <Menu.Target>
            <Button variant="subtle" color="gray">
              Manage
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() =>
                act(() =>
                  authClient.admin.setRole({
                    userId: user.id,
                    role: isAdmin ? "user" : "admin",
                  }),
                )
              }
            >
              {isAdmin ? "Make user" : "Make admin"}
            </Menu.Item>
            <Menu.Item onClick={resetPassword}>Reset password</Menu.Item>
            {user.banned ? (
              <Menu.Item
                onClick={() =>
                  act(() => authClient.admin.unbanUser({ userId: user.id }))
                }
              >
                Reactivate
              </Menu.Item>
            ) : (
              <Menu.Item
                color="red"
                disabled={user.id === me.id}
                onClick={() =>
                  act(() => authClient.admin.banUser({ userId: user.id }))
                }
              >
                Deactivate
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
};

const Status = ({ user }: { user: AdminUser }) => {
  if (user.banned) {
    return (
      <Badge variant="light" color="gray">
        Deactivated
      </Badge>
    );
  }
  if (user.invited) {
    return (
      <Badge variant="light" color="brand">
        Invitation pending
      </Badge>
    );
  }
  if (user.mustChangePassword) {
    return (
      <Badge
        variant="light"
        styles={{
          root: { background: palette.warningSoft, color: palette.warningInk },
        }}
      >
        Temporary password
      </Badge>
    );
  }
  return (
    <Badge variant="light" color="green">
      Active
    </Badge>
  );
};
