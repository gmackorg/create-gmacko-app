import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

import { SessionOrKey } from "../security";
import { SessionState } from "./models";

/**
 * Sign-in itself is better-auth's (`/api/auth/*`, mounted separately); this
 * group only answers "who am I" for either credential kind, plus the
 * template's smoke endpoint.
 */
export class AuthApi extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.get("session", "/session", {
      success: SessionState,
    }),
  )
  .add(
    HttpApiEndpoint.get("secret", "/secret", {
      success: Schema.String,
    }).middleware(SessionOrKey("read")),
  )
  .prefix("/auth") {}
