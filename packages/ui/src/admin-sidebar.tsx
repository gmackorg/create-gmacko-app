import type * as React from "react";

import { Button } from "./button";
import { cn } from "./index";
import type { LinkRenderer } from "./marketing-page";
import { Separator } from "./separator";

export interface AdminNavItem {
  readonly title: string;
  readonly href: string;
  readonly icon?: React.ReactNode;
}

const DashboardIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
    aria-hidden="true"
  >
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </svg>
);

const UsersIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
    aria-hidden="true"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const adminNav: ReadonlyArray<AdminNavItem> = [
  { title: "Dashboard", href: "/admin", icon: DashboardIcon },
  { title: "Users", href: "/admin/users", icon: UsersIcon },
];

const Anchor: LinkRenderer = ({ href, className, children }) => (
  <a href={href} className={className}>
    {children}
  </a>
);

/** The admin section's left rail; the active item is the current path's. */
export function AdminSidebar(props: {
  currentPath: string;
  items?: ReadonlyArray<AdminNavItem>;
  Link?: LinkRenderer;
}) {
  const Link = props.Link ?? Anchor;
  const items = props.items ?? adminNav;
  return (
    <aside className="bg-card flex h-full w-64 flex-col border-r">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden="true"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span>Admin Panel</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-4" aria-label="Admin">
        {items.map((item) => {
          const isActive =
            props.currentPath === item.href ||
            (item.href !== "/admin" && props.currentPath.startsWith(item.href));
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              className={cn("w-full justify-start gap-2")}
              asChild
            >
              <Link href={item.href}>
                {item.icon}
                {item.title}
              </Link>
            </Button>
          );
        })}
      </nav>

      <Separator />

      <div className="p-4">
        <Button variant="ghost" className="w-full justify-start gap-2" asChild>
          <Link href="/">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Back to App
          </Link>
        </Button>
      </div>
    </aside>
  );
}
