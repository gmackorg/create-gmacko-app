import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AdminDashboard } from "./_components/dashboard";

export default async function AdminPage() {
  await prefetch(trpc.admin.stats.queryOptions());
  await prefetch(trpc.admin.listUsers.queryOptions({ limit: 5 }));

  return (
    <HydrateClient>
      <div className="p-6">
        <h1 className="mb-6 text-3xl font-bold">Admin Dashboard</h1>
        <AdminDashboard />
      </div>
    </HydrateClient>
  );
}
