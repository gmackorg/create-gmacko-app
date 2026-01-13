"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { integrations } from "@gmacko/config";

import { defaultLocale, supportedLocales, useLocale } from "./index";

const localeLabels: Record<string, string> = {
  en: "English",
  es: "Espanol",
  fr: "Francais",
  de: "Deutsch",
  ja: "Japanese",
  zh: "Chinese",
};

interface LocaleSwitcherProps {
  className?: string;
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps): ReactNode {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  if (!integrations.i18n) {
    return null;
  }

  const handleChange = (newLocale: string) => {
    const segments = pathname.split("/").filter(Boolean);

    if (supportedLocales.includes(segments[0] ?? "")) {
      segments[0] = newLocale;
    } else {
      segments.unshift(newLocale);
    }

    const newPath =
      newLocale === defaultLocale
        ? "/" + segments.slice(1).join("/") || "/"
        : "/" + segments.join("/");

    router.push(newPath);
  };

  return (
    <select
      value={locale}
      onChange={(e) => handleChange(e.target.value)}
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
