import createMiddleware from "next-intl/middleware";

import { integrations } from "@gmacko/config";

import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function middleware(
  request: Parameters<typeof intlMiddleware>[0],
) {
  // If i18n is disabled, skip locale routing
  if (!integrations.i18n) {
    return;
  }

  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except for:
  // - API routes
  // - Static files (images, fonts, etc.)
  // - Next.js internals
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
    // Also match the root
    "/",
  ],
};
