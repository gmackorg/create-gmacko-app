export {
  changeLocaleNative,
  getDeviceLocale,
  I18nNativeProvider,
  i18next,
  initI18nNative,
  isI18nNativeEnabled,
  useLocaleNative,
  useTranslationsNative,
} from "./native";
export type { Locale, Messages } from "./web";
export {
  defaultLocale,
  getLocaleFromPath,
  getPathWithLocale,
  I18nProvider,
  isI18nEnabled,
  LocaleSwitcher,
  loadMessages,
  supportedLocales,
  useLocale,
  useTranslations,
} from "./web";
