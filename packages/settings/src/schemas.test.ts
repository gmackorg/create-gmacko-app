import { describe, expect, it } from "vitest";

import {
  apiKeyPermissionSchema,
  createApiKeySchema,
  themeSchema,
  userPreferencesSchema,
} from "./schemas";

describe("themeSchema", () => {
  it("accepts valid themes", () => {
    expect(themeSchema.parse("light")).toBe("light");
    expect(themeSchema.parse("dark")).toBe("dark");
    expect(themeSchema.parse("system")).toBe("system");
  });

  it("rejects invalid themes", () => {
    expect(() => themeSchema.parse("invalid")).toThrow();
    expect(() => themeSchema.parse(123)).toThrow();
  });
});

describe("userPreferencesSchema", () => {
  it("applies defaults for missing fields", () => {
    const result = userPreferencesSchema.parse({});
    expect(result.theme).toBe("system");
    expect(result.language).toBe("en");
    expect(result.timezone).toBe("UTC");
    expect(result.emailNotifications).toBe(true);
    expect(result.pushNotifications).toBe(true);
  });

  it("accepts valid preferences", () => {
    const input = {
      theme: "dark",
      language: "es",
      timezone: "America/New_York",
      emailNotifications: false,
      pushNotifications: true,
    };
    const result = userPreferencesSchema.parse(input);
    expect(result).toEqual(input);
  });
});

describe("apiKeyPermissionSchema", () => {
  it("accepts valid permissions", () => {
    expect(apiKeyPermissionSchema.parse("read")).toBe("read");
    expect(apiKeyPermissionSchema.parse("write")).toBe("write");
    expect(apiKeyPermissionSchema.parse("delete")).toBe("delete");
    expect(apiKeyPermissionSchema.parse("admin")).toBe("admin");
  });

  it("rejects invalid permissions", () => {
    expect(() => apiKeyPermissionSchema.parse("superuser")).toThrow();
  });
});

describe("createApiKeySchema", () => {
  it("accepts valid API key creation input", () => {
    const input = {
      name: "My API Key",
      permissions: ["read", "write"],
    };
    const result = createApiKeySchema.parse(input);
    expect(result.name).toBe("My API Key");
    expect(result.permissions).toEqual(["read", "write"]);
  });

  it("accepts expiration days", () => {
    const input = {
      name: "Temporary Key",
      permissions: ["read"],
      expiresInDays: 30,
    };
    const result = createApiKeySchema.parse(input);
    expect(result.expiresInDays).toBe(30);
  });

  it("rejects empty name", () => {
    expect(() =>
      createApiKeySchema.parse({ name: "", permissions: ["read"] }),
    ).toThrow();
  });

  it("rejects empty permissions", () => {
    expect(() =>
      createApiKeySchema.parse({ name: "Key", permissions: [] }),
    ).toThrow();
  });

  it("rejects name over 100 characters", () => {
    const longName = "a".repeat(101);
    expect(() =>
      createApiKeySchema.parse({ name: longName, permissions: ["read"] }),
    ).toThrow();
  });
});
