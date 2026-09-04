import { Schema } from "effect";
import { Model } from "effect/unstable/schema";

import { UserRole } from "../roles";
import { UserId } from "./ids";

/**
 * `user` (better-auth 1.7). Every column is public, so `UserModel.json` is
 * the contract's `User` verbatim; `jsonCreate`/`jsonUpdate` drop the id and
 * the audit timestamps because better-auth writes them.
 */
export class UserModel extends Model.Class<UserModel>("UserModel")({
  id: Model.GeneratedByApp(UserId),
  name: Schema.String,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
  role: UserRole,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.Date),
}) {}
