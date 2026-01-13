import { defineRouting } from "next-intl/routing";

import { integrations } from "@gmacko/config";

export const defaultLocale = "en";
export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale,
  // When i18n is disabled, don't use locale prefixes
  localePrefix: integrations.i18n ? "as-needed" : "never",
});
