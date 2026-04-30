import "server-only";

import { initAuth } from "@gmacko/auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { cache } from "react";

import { env } from "~/env";

const baseUrl =
  env.APP_URL ??
  env.PORTLESS_URL ??
  env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

export const auth = initAuth({
  baseUrl,
  productionUrl: env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? baseUrl,
  secret: env.AUTH_SECRET,
  githubClientId: env.AUTH_GITHUB_ID,
  githubClientSecret: env.AUTH_GITHUB_SECRET,
  googleClientId: env.AUTH_GOOGLE_ID,
  googleClientSecret: env.AUTH_GOOGLE_SECRET,
  appleClientId: env.AUTH_APPLE_ID,
  appleClientSecret: env.AUTH_APPLE_SECRET,
  appleBundleIdentifier: env.AUTH_APPLE_BUNDLE_ID,
  githubUrl: env.AUTH_GITHUB_URL,
  githubApiUrl: env.AUTH_GITHUB_API_URL,
  googleUrl: env.AUTH_GOOGLE_URL,
  googleTokenUrl: env.AUTH_GOOGLE_TOKEN_URL,
  appleUrl: env.AUTH_APPLE_URL,
  bypassMagicLink: env.BYPASS_MAGIC_LINK,
  extraPlugins: [nextCookies()],
});

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
