import { env } from "~/env";
import { initSentryWeb } from "~/env/monitoring";

initSentryWeb({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN ?? "",
});
