import type { Locale, Messages } from "@gmacko/i18n/native";
import {
  changeLocaleNative,
  defaultLocale,
  getDeviceLocale,
} from "@gmacko/i18n/native";
import * as SecureStore from "expo-secure-store";

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

export async function setLocale(locale: Locale): Promise<void> {
  await changeLocaleNative(locale);
  await saveLocale(locale);
}

export type { Locale, Messages };
export { defaultLocale, getDeviceLocale };
