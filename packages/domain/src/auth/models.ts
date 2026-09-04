/**
 * Who is calling. `User` is the one shape both credential kinds resolve to
 * (a cookie session or a `gmk_` key), including the platform role better-auth
 * leaves optional in its own inference.
 */
import { Schema } from "effect";

import { UserModel } from "../models/auth";
import { UserId } from "../models/ids";
import { Email, id } from "../primitives";
import { Credential } from "../roles";

export { UserId };

/** The `user` row as the API returns it: `UserModel.json`, named. */
export class User extends Schema.Class<User>("User")(UserModel.json.fields) {}

export const SessionId = id("SessionId");
export type SessionId = typeof SessionId.Type;

/** A better-auth session record. The token is never part of the contract. */
export class SessionRecord extends Schema.Class<SessionRecord>("SessionRecord")(
  {
    id: SessionId,
    userId: UserId,
    expiresAt: Schema.Date,
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
    ipAddress: Schema.NullOr(Schema.String),
    userAgent: Schema.NullOr(Schema.String),
  },
) {}

/**
 * `GET /api/auth/session`: anonymous (`user: null`) or the resolved user plus
 * the credential kind that resolved it.
 */
export class SessionState extends Schema.Class<SessionState>("SessionState")({
  user: Schema.NullOr(User),
  credential: Schema.NullOr(Credential),
}) {}

/** The sign-in form: better-auth's magic-link endpoint takes the email. */
export class MagicLinkRequest extends Schema.Class<MagicLinkRequest>(
  "MagicLinkRequest",
)({
  email: Email,
}) {}

/** Standard Schema view for TanStack Form validators. */
export const MagicLinkRequestForm = Schema.toStandardSchemaV1(MagicLinkRequest);
