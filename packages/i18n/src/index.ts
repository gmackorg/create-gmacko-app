export type { Messages, Locale } from "./web";
export { defaultLocale, supportedLocales } from "./web";

export {
  isI18nEnabled,
  I18nProvider,
  useTranslations,
  useLocale,
  getLocaleFromPath,
  getPathWithLocale,
  loadMessages,
} from "./web";

export {
  isI18nNativeEnabled,
  getDeviceLocale,
  initI18nNative,
  I18nNativeProvider,
  useTranslationsNative,
  useLocaleNative,
  changeLocaleNative,
  i18next,
} from "./native";
