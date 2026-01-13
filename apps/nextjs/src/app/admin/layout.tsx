import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { AdminSidebar } from "~/components/admin/sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Check if user is authenticated
  if (!session?.user) {
    redirect("/");
  }

  // Check if user has admin role
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
