import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getLocales } from "expo-localization";
import i18next from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";

import { integrations } from "@gmacko/config";

export type Messages = Record<string, Record<string, string>>;
export type Locale = string;

export const defaultLocale: Locale = "en";
export const supportedLocales: Locale[] = ["en", "es", "fr", "de", "ja", "zh"];

let initialized = false;

export function isI18nNativeEnabled(): boolean {
  return integrations.i18n;
}

export function getDeviceLocale(): Locale {
  const locales = getLocales();
  const deviceLocale = locales[0]?.languageCode ?? defaultLocale;
  if (supportedLocales.includes(deviceLocale)) {
    return deviceLocale;
  }
  return defaultLocale;
}

export async function initI18nNative(
  resources: Record<Locale, { translation: Messages }>,
  initialLocale?: Locale,
): Promise<void> {
  if (!integrations.i18n || initialized) {
    return;
  }

  const locale = initialLocale ?? getDeviceLocale();

  await i18next.init({
    compatibilityJSON: "v4",
    lng: locale,
    fallbackLng: defaultLocale,
    resources,
    interpolation: {
      escapeValue: false,
    },
  });

  initialized = true;
}

interface I18nNativeProviderProps {
  children: ReactNode;
  resources: Record<Locale, { translation: Messages }>;
  initialLocale?: Locale;
}

export function I18nNativeProvider({
  children,
  resources,
  initialLocale,
}: I18nNativeProviderProps): ReactNode {
  const [ready, setReady] = useState(initialized);

  useEffect(() => {
    if (integrations.i18n && !initialized) {
      initI18nNative(resources, initialLocale).then(() => setReady(true));
    }
  }, [resources, initialLocale]);

  if (!integrations.i18n) {
    return children;
  }

  if (!ready) {
    return null;
  }

  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}

export function useTranslationsNative(namespace?: string) {
  const { t } = useTranslation(namespace);
  if (!integrations.i18n) {
    return (key: string) => key;
  }
  return t;
}

export function useLocaleNative(): Locale {
  if (!integrations.i18n || !initialized) {
    return defaultLocale;
  }
  return i18next.language;
}

export async function changeLocaleNative(locale: Locale): Promise<void> {
  if (!integrations.i18n || !initialized) {
    return;
  }
  await i18next.changeLanguage(locale);
}

export { i18next };
