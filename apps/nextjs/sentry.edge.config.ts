import { initSentryWeb } from "@gmacko/monitoring/web";

import { env } from "~/env";

initSentryWeb({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN ?? "",
});
