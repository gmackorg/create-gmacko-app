import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { UsersList } from "./_components/users-list";

export default async function AdminUsersPage() {
  await prefetch(trpc.admin.listUsers.queryOptions({ limit: 20 }));

  return (
    <HydrateClient>
      <div className="p-6">
        <h1 className="mb-6 text-3xl font-bold">User Management</h1>
        <UsersList />
      </div>
    </HydrateClient>
  );
}
