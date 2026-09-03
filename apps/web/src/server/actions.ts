/**
 * The only `createServerFn` file in the app (plan principle 09): server
 * functions exist for actions that must set a cookie or redirect. Every
 * read and write of app data goes through the contract client instead.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { authApi } from "~/server/runtime";

/**
 * Ends the better-auth session and clears its cookies on the response
 * (`tanstackStartCookies` forwards better-auth's Set-Cookie into Start's
 * response). The caller then clears its query cache and navigates.
 */
export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const auth = await authApi();
  await auth.signOut({ headers: new Headers(getRequestHeaders()) });
  return { ok: true as const };
});
