/**
 * What the credential middlewares need to know about the deployment, as a
 * service so this package stays framework-free: apps/web derives it from its
 * `AppConfig`, tests pass a literal.
 */
import type { Stage } from "@gmacko/domain/health";
import { Context } from "effect";

export interface AuthSecurityConfigShape {
  /**
   * Origins a cookie-authenticated non-GET request may come from (the app
   * URL, the Expo dev origin). Compared exactly against the `Origin` header,
   * normalised through `new URL(...).origin`; never a substring match.
   */
  readonly allowedOrigins: ReadonlyArray<string>;
  /**
   * The deployment stage, from the app's `AppConfig` (packages/api's
   * `AuthSecurityConfigLive`). Nothing in this package branches on it yet:
   * the cookie path reads whichever session cookie name better-auth set
   * (docs/API_AUTH.md, rule 4) rather than deriving it from the stage.
   */
  readonly stage: Stage;
}

export class AuthSecurityConfig extends Context.Service<
  AuthSecurityConfig,
  AuthSecurityConfigShape
>()("@gmacko/auth/AuthSecurityConfig") {}
