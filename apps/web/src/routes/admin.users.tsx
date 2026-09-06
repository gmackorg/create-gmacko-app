import { Button } from "@gmacko/ui/button";
import { toast } from "@gmacko/ui/toast";
import { UsersTable } from "@gmacko/ui/users-table";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useApiErrorHandler } from "~/components/use-api-error";
import { mutations, queries } from "~/lib/api";
import type { RawSearch, SearchValue } from "~/lib/search";

const PAGE_SIZE = 20;

/** 1-based page number; anything the URL cannot mean as one is page 1. */
const pageOf = (value: SearchValue): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

export const Route = createFileRoute("/admin/users")({
  validateSearch: (search: RawSearch) => ({
    page: pageOf(search.page),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.prefetchQuery(
      queries.admin.listUsers({
        limit: PAGE_SIZE,
        offset: (deps.page - 1) * PAGE_SIZE,
      }),
    );
  },
  head: () => ({ meta: [{ title: "Users · Admin · Gmacko App" }] }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { page } = Route.useSearch();
  const offset = (page - 1) * PAGE_SIZE;
  const { data } = useSuspenseQuery(
    queries.admin.listUsers({ limit: PAGE_SIZE, offset }),
  );
  const onError = useApiErrorHandler();
  const updateRole = useMutation({
    ...mutations.admin.updateUserRole(),
    onSuccess: (user) => toast.success(`${user.email} is now ${user.role}.`),
    onError: (error) => onError(error, "Could not change that role."),
  });

  const from = data.users.length === 0 ? 0 : offset + 1;
  const to = offset + data.users.length;

  return (
    <div className="p-6">
      <h1 className="mb-6 text-3xl font-bold">User Management</h1>
      <UsersTable
        users={data.users}
        disabled={updateRole.isPending}
        onRoleChange={(userId, role) => updateRole.mutate({ userId, role })}
        footer={
          <>
            <span className="text-muted-foreground" data-testid="users-range">
              Showing {from}-{to} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                asChild={page > 1}
              >
                {page > 1 ? (
                  <Link to="/admin/users" search={{ page: page - 1 }}>
                    Previous
                  </Link>
                ) : (
                  "Previous"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!data.hasMore}
                asChild={data.hasMore}
              >
                {data.hasMore ? (
                  <Link to="/admin/users" search={{ page: page + 1 }}>
                    Next
                  </Link>
                ) : (
                  "Next"
                )}
              </Button>
            </div>
          </>
        }
      />
    </div>
  );
}
