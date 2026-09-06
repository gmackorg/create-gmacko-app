/**
 * `@gmacko/i18n/web`: translations for the web app over react-i18next
 * (the same runtime the native side uses), framework-free: no router, no
 * server components. `I18nProvider` owns one i18next instance per
 * (locale, messages reference) — see `instanceFor` — and
 * `useTranslations(namespace)` returns a `t` scoped to that namespace of
 * the nested message files (`messages/en.json`), so
 * `useTranslations("common")("loading")` reads `common.loading`. A key the
 * locale lacks resolves from the default locale's messages when the
 * provider is given them (`fallbackMessages`, `loadLocale`).
 */
import { integrations } from "@gmacko/config";
import { createInstance, type i18n as I18nInstance } from "i18next";
import type { ReactNode } from "react";
import { useContext, useMemo } from "react";
import {
  I18nContext,
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

/**
 * A ready i18next instance for one locale; synchronous, no I/O. With
 * `fallbackMessages` (the default locale's file) a key missing from
 * `messages` resolves there instead of rendering as the key.
 */
export function createI18n(
  locale: Locale,
  messages: Messages,
  fallbackMessages?: Messages,
): I18nInstance {
  const instance = createInstance();
  instance.use(initReactI18next);
  const resources = { [locale]: { translation: messages } };
  if (fallbackMessages !== undefined && locale !== defaultLocale) {
    resources[defaultLocale] = { translation: fallbackMessages };
  }
  void instance.init({
    lng: locale,
    fallbackLng: defaultLocale,
    resources,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}

/**
 * One instance per (locale, messages, fallbackMessages) reference triple,
 * held weakly on the messages object. The identity of `messages` is the
 * cache key: keep it stable (a module constant, a loader's result kept in
 * state or a memo), because a fresh object each render builds a fresh
 * i18next instance each render.
 */
const instances = new WeakMap<
  Messages,
  Map<Locale, WeakMap<Messages, I18nInstance>>
>();
/** Stands in for "no fallback" as a WeakMap key. */
const NO_FALLBACK: Messages = {};

export function instanceFor(
  locale: Locale,
  messages: Messages,
  fallbackMessages?: Messages,
): I18nInstance {
  let byLocale = instances.get(messages);
  if (byLocale === undefined) {
    byLocale = new Map();
    instances.set(messages, byLocale);
  }
  const fallback = fallbackMessages ?? NO_FALLBACK;
  let byFallback = byLocale.get(locale);
  if (byFallback === undefined) {
    byFallback = new WeakMap();
    byLocale.set(locale, byFallback);
  }
  let instance = byFallback.get(fallback);
  if (instance === undefined) {
    instance = createI18n(locale, messages, fallbackMessages);
    byFallback.set(fallback, instance);
  }
  return instance;
}

interface I18nProviderProps {
  children: ReactNode;
  locale: Locale;
  /** Keep this reference stable across renders (see `instanceFor`). */
  messages: Messages;
  /** The default locale's messages, for keys `messages` lacks. */
  fallbackMessages?: Messages | undefined;
}

export function I18nProvider({
  children,
  locale,
  messages,
  fallbackMessages,
}: I18nProviderProps): ReactNode {
  const instance = useMemo(
    () => instanceFor(locale, messages, fallbackMessages),
    [locale, messages, fallbackMessages],
  );
  if (!integrations.i18n) {
    return children;
  }
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/**
 * The instance react-i18next's hooks run on when no provider is above the
 * caller (the toggle is off, or a component renders outside `I18nProvider`):
 * an empty default-locale instance, so `useTranslation` never warns about a
 * missing instance and `t` returns the key.
 */
let detached: I18nInstance | undefined;
const detachedInstance = (): I18nInstance => {
  detached ??= createI18n(defaultLocale, {});
  return detached;
};

/**
 * The provider's instance when there is one, else the detached one. Hooks stay
 * unconditional. react-i18next types the context as always carrying an `i18n`,
 * but its default value is empty until a provider mounts, so the binding is
 * annotated for what the context actually holds outside one.
 */
const useInstance = (): I18nInstance => {
  const context: { i18n?: I18nInstance } | undefined = useContext(I18nContext);
  return context?.i18n ?? detachedInstance();
};

/**
 * The values an interpolated message substitutes: `t("greeting", { name })`
 * renders `{{name}}`. i18next stringifies each one, so only values with a
 * meaningful string form belong here.
 */
export type TranslationValues = Readonly<
  Record<string, string | number | boolean | Date>
>;

/** `t` for one namespace of the nested messages; the key itself when i18n is off. */
export function useTranslations(
  namespace?: string,
): (key: string, values?: TranslationValues) => string {
  const { t } = useTranslation(undefined, { i18n: useInstance() });
  if (!integrations.i18n) {
    return (key: string) => key;
  }
  return (key, values) =>
    t(namespace ? `${namespace}.${key}` : key, values ?? {});
}

export function useLocale(): Locale {
  const { i18n } = useTranslation(undefined, { i18n: useInstance() });
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
  // A template-literal specifier makes TypeScript type the import `any`; the
  // annotations state what `messages/*.json` are — two-level string maps.
  try {
    const messages: { default: Messages } = await import(
      `../../messages/${locale}.json`
    );
    return messages.default;
  } catch {
    const fallback: { default: Messages } = await import(
      `../../messages/${defaultLocale}.json`
    );
    return fallback.default;
  }
}

/**
 * Everything `I18nProvider` needs for one locale: its messages and, for
 * any other locale than the default, the default locale's messages as the
 * fallback. Hold the result (state, a route loader) so the references stay
 * stable.
 */
export async function loadLocale(locale: Locale): Promise<{
  readonly locale: Locale;
  readonly messages: Messages;
  readonly fallbackMessages: Messages | undefined;
}> {
  const messages = await loadMessages(locale);
  const fallbackMessages =
    locale === defaultLocale ? undefined : await loadMessages(defaultLocale);
  return { locale, messages, fallbackMessages };
}

export { LocaleSwitcher } from "./locale-switcher";
