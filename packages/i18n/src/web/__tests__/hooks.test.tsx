/**
 * The hooks with the toggle off (`integrations.i18n` is false): no
 * react-i18next "no instance" warning, the key comes back, the locale is
 * the default. In its own file so no earlier `createI18n` has registered
 * a global instance that would mask the warning.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider, useLocale, useTranslations } from "../index";

const en = { common: { loading: "Loading", save: "Save" } };
const es = { common: { loading: "Cargando" } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hooks with the toggle off (integrations.i18n is false)", () => {
  function Label() {
    const t = useTranslations("common");
    const locale = useLocale();
    return (
      <span>
        {t("loading")}:{locale}
      </span>
    );
  }

  it("return the key and the default locale without a react-i18next warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = renderToStaticMarkup(<Label />);
    expect(html).toBe("<span>loading:en</span>");
    expect(warn).not.toHaveBeenCalled();
  });

  it("render through the provider unchanged", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = renderToStaticMarkup(
      <I18nProvider locale="es" messages={es} fallbackMessages={en}>
        <Label />
      </I18nProvider>,
    );
    expect(html).toBe("<span>loading:en</span>");
    expect(warn).not.toHaveBeenCalled();
  });
});
