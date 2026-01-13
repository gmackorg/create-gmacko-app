import { getRequestConfig } from "next-intl/server";

import { integrations } from "@gmacko/config";

import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // If i18n is disabled, always use default locale
  if (!integrations.i18n) {
    const messages = (await import("@gmacko/i18n/messages/en.json")).default;
    return {
      locale: routing.defaultLocale,
      messages,
    };
  }

  // Get the locale from the request (set by middleware)
  let locale = await requestLocale;

  // Validate that the incoming locale is supported
  if (
    !locale ||
    !routing.locales.includes(locale as (typeof routing.locales)[number])
  ) {
    locale = routing.defaultLocale;
  }

  // Load messages for the locale
  const messages = (await import(`@gmacko/i18n/messages/${locale}.json`))
    .default;

  return {
    locale,
    messages,
  };
});
