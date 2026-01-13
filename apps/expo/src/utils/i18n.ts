import * as SecureStore from "expo-secure-store";

import type { Locale, Messages } from "@gmacko/i18n/native";
import {
  changeLocaleNative,
  defaultLocale,
  getDeviceLocale,
  initI18nNative,
} from "@gmacko/i18n/native";

const LOCALE_KEY = "user_locale";

export function getStoredLocale(): Locale {
  const stored = SecureStore.getItem(LOCALE_KEY);
  if (stored) {
    return stored;
  }
  return getDeviceLocale();
}

export async function saveLocale(locale: Locale): Promise<void> {
  await SecureStore.setItemAsync(LOCALE_KEY, locale);
}

export async function clearStoredLocale(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCALE_KEY);
}

export async function setLocale(locale: Locale): Promise<void> {
  await changeLocaleNative(locale);
  await saveLocale(locale);
}

export async function initializeI18n(
  resources: Record<Locale, { translation: Messages }>,
): Promise<Locale> {
  const storedLocale = getStoredLocale();
  await initI18nNative(resources, storedLocale);
  return storedLocale;
}

export { defaultLocale, getDeviceLocale };
export type { Locale, Messages };
