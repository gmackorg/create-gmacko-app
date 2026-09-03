/**
 * `@gmacko/i18n/web`: translations for the web app over react-i18next
 * (the same runtime the native side uses), framework-free: no router, no
 * server components. `I18nProvider` owns one i18next instance per locale;
 * `useTranslations(namespace)` returns a `t` scoped to that namespace of
 * the nested message files (`messages/en.json`), so
 * `useTranslations("common")("loading")` reads `common.loading`.
 */
import { integrations } from "@gmacko/config";
import { createInstance, type i18n as I18nInstance } from "i18next";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from "react-i18next";

export type Messages = Record<string, Record<string, string>>;
export type Locale = string;

export const defaultLocale: Locale = "en";
export const supportedLocales: Locale[] = ["en", "es", "fr", "de", "ja", "zh"];

export function isI18nEnabled(): boolean {
  return integrations.i18n;
}

/** A ready i18next instance for one locale; synchronous, no I/O. */
export function createI18n(locale: Locale, messages: Messages): I18nInstance {
  const instance = createInstance();
  instance.use(initReactI18next);
  void instance.init({
    lng: locale,
    fallbackLng: defaultLocale,
    resources: { [locale]: { translation: messages } },
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
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
  const instance = useMemo(
    () => createI18n(locale, messages),
    [locale, messages],
  );
  if (!integrations.i18n) {
    return children;
  }
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/** `t` for one namespace of the nested messages; the key itself when i18n is off. */
export function useTranslations(
  namespace?: string,
): (key: string, values?: Record<string, unknown>) => string {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const { t } = useTranslation();
  if (!integrations.i18n) {
    return (key: string) => key;
  }
  return (key, values) =>
    t(namespace ? `${namespace}.${key}` : key, values ?? {});
}

export function useLocale(): Locale {
  // Always call hooks unconditionally to satisfy React's rules of hooks
  const { i18n } = useTranslation();
  if (!integrations.i18n) {
    return defaultLocale;
  }
  return i18n.language || defaultLocale;
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
  return `/${segments.join("/")}`;
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
