/**
 * The header provider for the API client: the better-auth Expo client's
 * stored cookie (SecureStore, read asynchronously) on every call, and
 * nothing when there is no session. Kept free of React Native imports so it
 * runs under vitest.
 *
 * Not named `make…`: that prefix is reserved here for Effect service
 * constructors whose dependencies must reach a composition root, and this is
 * a plain function from a cookie source to a `HeadersProvider`.
 */
import type { HeadersProvider } from "@gmacko/api-client";

export type CookieSource = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

export const headersFromCookie =
  (getCookie: CookieSource): HeadersProvider =>
  async () => {
    const cookie = await getCookie();
    return cookie ? { cookie } : {};
  };
