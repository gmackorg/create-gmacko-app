import { describe, expect, it } from "vitest";

import { provisionServiceOptions } from "../provision.js";

describe("provisioning guidance", () => {
  it("offers the local D1 and ForgeGraph + Cloudflare instead of Neon, Vercel or Postgres", () => {
    // The PATH probe is injected so the option list is the same on every
    // machine, whether or not gh/tea/eas happen to be installed.
    const options = provisionServiceOptions(
      {
        projectPath: "/tmp/test-app",
        appName: "test-app",
        platforms: {
          web: true,
          mobile: true,
        },
      },
      () => false,
    );

    const labels = options.map((option) => option.label);

    expect(options.map((option) => option.value)).toEqual([
      "git",
      "database",
      "forgegraph",
      "eas",
    ]);
    expect(labels).toContain("ForgeGraph + Cloudflare deployment");
    expect(labels).toContain("Local D1 database (migrate + seed)");
    expect(labels).toContain("EAS Build (Expo)");
    expect(labels).not.toContain("Neon Database");
    expect(labels).not.toContain("Vercel Deployment");
    expect(labels).not.toContain("Postgres Setup");
  });
});
