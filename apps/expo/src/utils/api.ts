/**
 * The typed API client for the app, plus the TanStack Query layer over it.
 * Auth is the better-auth Expo client's cookie (see api-headers.ts); the
 * `QueryClient` applies each mutation's `invalidates` on success, so screens
 * never invalidate by hand.
 */
import { makeApiClient } from "@gmacko/api-client";
import {
  makeMutations,
  makeQueries,
  makeQueryClient,
} from "@gmacko/api-client/queries";

import { headersFromCookie } from "./api-headers";
import { authClient } from "./auth";
import { getBaseUrl } from "./base-url";

export const api = makeApiClient({
  baseUrl: getBaseUrl(),
  // @better-auth/expo 1.7 reads SecureStore asynchronously.
  headers: headersFromCookie(() => authClient.getCookie()),
});

export const queries = makeQueries(api);
export const mutations = makeMutations(api);

export const queryClient = makeQueryClient();
