import { env } from "~/env";

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  if (env.APP_URL) {
    return env.APP_URL;
  }

  // oxlint-disable-next-line no-restricted-properties
  return `http://localhost:${process.env.PORT ?? 3001}`;
}
