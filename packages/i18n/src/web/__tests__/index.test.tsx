/**
 * `@gmacko/i18n/web`: one i18next instance per (locale, messages
 * reference), and the default locale's messages back a partial
 * translation. The hooks are in hooks.test.tsx, on a fresh module.
 */
import { describe, expect, it } from "vitest";

import { createI18n, instanceFor } from "../index";

const en = { common: { loading: "Loading", save: "Save" } };
const es = { common: { loading: "Cargando" } };

describe("instanceFor", () => {
  it("returns the same instance for the same locale and messages reference", () => {
    const first = instanceFor("es", es);
    expect(instanceFor("es", es)).toBe(first);
    expect(instanceFor("en", es)).not.toBe(first);
    // A new object, even with equal contents, is a new instance: callers
    // hold `messages` stable (a module constant or a loader's result).
    expect(instanceFor("es", { ...es })).not.toBe(first);
  });

  it("keys on the fallback messages reference as well", () => {
    const withFallback = instanceFor("es", es, en);
    expect(instanceFor("es", es, en)).toBe(withFallback);
    expect(instanceFor("es", es)).not.toBe(withFallback);
  });
});

describe("createI18n", () => {
  it("resolves a key missing from the locale from the fallback messages", () => {
    const i18n = createI18n("es", es, en);
    expect(i18n.t("common.loading")).toBe("Cargando");
    expect(i18n.t("common.save")).toBe("Save");
  });

  it("does not register the default locale twice", () => {
    const i18n = createI18n("en", en, en);
    expect(i18n.t("common.save")).toBe("Save");
    expect(i18n.getResourceBundle("en", "translation")).toEqual(en);
  });
});
