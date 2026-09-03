import { AdminSidebar } from "@gmacko/ui/admin-sidebar";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { RouterLink } from "~/components/router-link";
import { queries } from "~/lib/api";
import { requireAdmin } from "~/lib/guards";

/**
 * The admin section's layout route: the guard runs once here for every
 * child. Anonymous visitors go to sign in; signed-in non-admins go home.
 */
export const Route = createFileRoute("/admin")({
  // Nothing is returned: a value here becomes route context and is
  // serialized for the browser, and the contract's class instances are not.
  beforeLoad: async ({ context: { queryClient } }) => {
    await requireAdmin(() =>
      queryClient.ensureQueryData(queries.auth.session()),
    );
  },
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <div className="flex h-screen">
      <AdminSidebar currentPath={pathname} Link={RouterLink} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
