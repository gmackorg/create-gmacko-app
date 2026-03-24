import { tanstackStartCookies } from "better-auth/tanstack-start";

import { initAuth } from "@gmacko/auth";

import { env } from "~/env";
import { getBaseUrl } from "~/lib/url";

export const auth = initAuth({
  baseUrl: getBaseUrl(),
  productionUrl: env.APP_URL ?? getBaseUrl(),
  secret: env.AUTH_SECRET,
  discordClientId: env.AUTH_DISCORD_ID,
  discordClientSecret: env.AUTH_DISCORD_SECRET,

  extraPlugins: [tanstackStartCookies()],
});
