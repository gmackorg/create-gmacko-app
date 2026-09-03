/**
 * One place that turns a stored user (a `user` row, or better-auth's session
 * user) into the contract's `User`, and a `User` into the `CurrentUser` a
 * middleware provides. better-auth types the `role` additional field as
 * optional; the column is NOT NULL DEFAULT 'user', so the fallback never
 * fires on real rows.
 */
import type { UserRole } from "@gmacko/db/schema";
import {
  type Credential,
  type CurrentUserShape,
  User,
  type UserId,
} from "@gmacko/domain";

/** The columns every source of a user has; `role`/`image` may be absent on better-auth's shape. */
export interface UserLike {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly image?: string | null | undefined;
  readonly role?: UserRole | null | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const toUser = (source: UserLike): User =>
  new User({
    id: source.id as UserId,
    name: source.name,
    email: source.email,
    emailVerified: source.emailVerified,
    image: source.image ?? null,
    role: source.role ?? "user",
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  });

export const toCurrentUser = (
  source: UserLike,
  credential: Credential,
): CurrentUserShape => ({ ...toUser(source), credential });
