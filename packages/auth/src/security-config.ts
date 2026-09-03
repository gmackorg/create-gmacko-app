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
  // TODO(Phase 4): unused — drop with the apps/web cleanup
  readonly stage: Stage;
}

export class AuthSecurityConfig extends Context.Service<
  AuthSecurityConfig,
  AuthSecurityConfigShape
>()("@gmacko/auth/AuthSecurityConfig") {}
