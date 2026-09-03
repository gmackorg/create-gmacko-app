import {
  MarketingCard,
  MarketingPage as Shell,
} from "@gmacko/ui/marketing-page";
import type * as React from "react";

import { RouterLink } from "~/components/router-link";

/** The public shell with the app's router wired in. */
export function MarketingPage(props: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return <Shell {...props} Link={RouterLink} />;
}

export { MarketingCard };

/** `head()` for a public page: its own title, the shared description. */
export const marketingHead = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} · Gmacko App` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} · Gmacko App` },
    { property: "og:description", content: description },
  ],
});
