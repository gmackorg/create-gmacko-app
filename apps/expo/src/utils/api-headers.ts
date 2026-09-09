/**
 * The header provider for the API client: the better-auth Expo client's
 * stored cookie (SecureStore, read asynchronously) on every call, plus the
 * device-paired session token as a bearer when one is stored (the server's
 * `bearer` plugin accepts it; a cookie session sends no such header), and
 * nothing when there is no session. Kept free of React Native imports so it
 * runs under vitest.
 *
 * Not named `make…`: that prefix is reserved here for Effect service
 * constructors whose dependencies must reach a composition root, and this is
 * a plain function from credential sources to a `HeadersProvider`.
 */
import type { HeadersProvider } from "@gmacko/api-client";

export type CookieSource = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

/** The device-paired session token, or nothing when this install never paired. */
export type TokenSource = () => string | null | undefined;

export const headersFromCredentials =
  (getCookie: CookieSource, getToken: TokenSource): HeadersProvider =>
  async () => {
    const headers: Record<string, string> = {};
    const cookie = await getCookie();
    if (cookie) headers.cookie = cookie;
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  };
