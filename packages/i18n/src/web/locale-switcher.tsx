/**
 * A plain `<select>` of the supported locales. Navigation is the app's
 * business (a TanStack Router `navigate`, a cookie-setting server function),
 * so the switcher reports the choice through `onChange` and does not touch
 * the URL itself; `getPathWithLocale` builds the target path when the app
 * prefixes routes with the locale.
 */
import { integrations } from "@gmacko/config";
import type { ReactNode } from "react";

import { supportedLocales, useLocale } from "./index";

const localeLabels: Record<string, string> = {
  en: "English",
  es: "Espanol",
  fr: "Francais",
  de: "Deutsch",
  ja: "Japanese",
  zh: "Chinese",
};

interface LocaleSwitcherProps {
  className?: string | undefined;
  /** The selected locale; defaults to the provider's current one. */
  locale?: string | undefined;
  onChange: (locale: string) => void;
}

export function LocaleSwitcher({
  className,
  locale,
  onChange,
}: LocaleSwitcherProps): ReactNode {
  const current = useLocale();

  if (!integrations.i18n) {
    return null;
  }

  return (
    <select
      value={locale ?? current}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      aria-label="Select language"
    >
      {supportedLocales.map((loc) => (
        <option key={loc} value={loc}>
          {localeLabels[loc] ?? loc}
        </option>
      ))}
    </select>
  );
}
