"use client";

import type { ReactNode } from "react";
import {
  NextIntlClientProvider,
  useLocale as useNextIntlLocale,
  useTranslations as useNextIntlTranslations,
} from "next-intl";

import { integrations } from "@gmacko/config";

export type Messages = Record<string, Record<string, string>>;
export type Locale = string;

export const defaultLocale: Locale = "en";
export const supportedLocales: Locale[] = ["en", "es", "fr", "de", "ja", "zh"];

export function isI18nEnabled(): boolean {
  return integrations.i18n;
}

interface I18nProviderProps {
  children: ReactNode;
  locale: Locale;
  messages: Messages;
}

export function I18nProvider({
  children,
  locale,
  messages,
}: I18nProviderProps): ReactNode {
  if (!integrations.i18n) {
    return children;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

export function useTranslations(namespace?: string) {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const translations = useNextIntlTranslations(namespace);
  if (!integrations.i18n) {
    return (key: string) => key;
  }
  return translations;
}

export function useLocale(): Locale {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const locale = useNextIntlLocale();
  if (!integrations.i18n) {
    return defaultLocale;
  }
  return locale;
}

export function getLocaleFromPath(pathname: string): Locale {
  const segments = pathname.split("/").filter(Boolean);
  const possibleLocale = segments[0];
  if (possibleLocale && supportedLocales.includes(possibleLocale)) {
    return possibleLocale;
  }
  return defaultLocale;
}

export function getPathWithLocale(pathname: string, locale: Locale): string {
  const currentLocale = getLocaleFromPath(pathname);
  if (currentLocale === locale) {
    return pathname;
  }
  const segments = pathname.split("/").filter(Boolean);
  if (supportedLocales.includes(segments[0] ?? "")) {
    segments[0] = locale;
  } else {
    segments.unshift(locale);
  }
  return "/" + segments.join("/");
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  try {
    const messages = (await import(`../../messages/${locale}.json`)) as {
      default: Messages;
    };
    return messages.default;
  } catch {
    const fallback = (await import(`../../messages/${defaultLocale}.json`)) as {
      default: Messages;
    };
    return fallback.default;
  }
}

export { LocaleSwitcher } from "./locale-switcher";
