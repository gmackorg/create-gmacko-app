"use client";

import { useState } from "react";

import { Button } from "./button";
import { Select } from "./select";

export type PlatformRole = "user" | "admin";

export interface UserRowData {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: PlatformRole;
  readonly image: string | null;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
}

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);

export function RoleBadge({ role }: { role: PlatformRole }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
        role === "admin"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {role}
    </span>
  );
}

export function UserAvatar({
  user,
  size = "md",
}: {
  user: Pick<UserRowData, "name" | "image">;
  size?: "sm" | "md";
}) {
  const dimension = size === "sm" ? "size-8" : "size-10";
  return user.image ? (
    <img
      src={user.image}
      alt={user.name}
      className={`${dimension} rounded-full`}
    />
  ) : (
    <div
      className={`bg-muted flex ${dimension} items-center justify-center rounded-full`}
      aria-hidden="true"
    >
      <span className="text-muted-foreground font-medium">
        {user.name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

/**
 * The admin user list with an inline role change that asks for
 * confirmation before it is sent. Pagination is the parent's: it renders
 * `footer` (prev/next) below the rows.
 */
export function UsersTable(props: {
  users: ReadonlyArray<UserRowData>;
  onRoleChange: (userId: string, role: PlatformRole) => void;
  disabled?: boolean | undefined;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-lg border" data-testid="users-table">
      <div className="border-b px-4 py-3">
        <div className="text-muted-foreground grid grid-cols-12 gap-4 text-sm font-medium">
          <div className="col-span-4">User</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-1">Actions</div>
        </div>
      </div>

      <div className="divide-y">
        {props.users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            onRoleChange={props.onRoleChange}
            disabled={props.disabled}
          />
        ))}
      </div>

      {props.users.length === 0 ? (
        <div className="text-muted-foreground p-8 text-center">
          No users found.
        </div>
      ) : null}

      {props.footer ? (
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          {props.footer}
        </div>
      ) : null}
    </div>
  );
}

function UserRow({
  user,
  onRoleChange,
  disabled,
}: {
  user: UserRowData;
  onRoleChange: (userId: string, role: PlatformRole) => void;
  disabled?: boolean | undefined;
}) {
  const [pendingRole, setPendingRole] = useState<PlatformRole | null>(null);

  return (
    <div
      className="grid grid-cols-12 items-center gap-4 px-4 py-3"
      data-testid="user-row"
      data-user-email={user.email}
    >
      <div className="col-span-4 flex items-center gap-3">
        <UserAvatar user={user} />
        <div>
          <p className="font-medium">{user.name}</p>
          {user.emailVerified ? (
            <span className="text-xs text-green-600">Verified</span>
          ) : null}
        </div>
      </div>

      <div className="text-muted-foreground col-span-3 truncate text-sm">
        {user.email}
      </div>

      <div className="col-span-2">
        <RoleBadge role={user.role} />
      </div>

      <div className="text-muted-foreground col-span-2 text-sm">
        {formatDate(user.createdAt)}
      </div>

      <div className="col-span-1">
        {pendingRole ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="default"
              disabled={disabled}
              onClick={() => {
                onRoleChange(user.id, pendingRole);
                setPendingRole(null);
              }}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPendingRole(null)}
            >
              No
            </Button>
          </div>
        ) : (
          <Select
            aria-label={`Role for ${user.email}`}
            value={user.role}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value as PlatformRole;
              if (next !== user.role) setPendingRole(next);
            }}
            className="h-8 px-2"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
        )}
      </div>
    </div>
  );
}
