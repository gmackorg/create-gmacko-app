import type { LinkRenderer } from "@gmacko/ui/marketing-page";
import { Link, type LinkProps } from "@tanstack/react-router";

/**
 * `@gmacko/ui`'s shells take a link renderer so they stay router-free; this
 * one is TanStack's `Link`, so the marketing nav and the admin rail get
 * client-side navigation and intent preloading.
 */
export const RouterLink: LinkRenderer = ({ href, className, children }) => (
  // SAFETY: `href` is always one of this app's own route paths — the shells
  // that take a `LinkRenderer` are given their hrefs by the routes in
  // src/routes, and `LinkProps["to"]` is exactly that set of paths. An href
  // outside it would still render; the router would answer its notFound.
  <Link to={href as LinkProps["to"]} className={className}>
    {children}
  </Link>
);
