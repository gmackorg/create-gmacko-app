import { describe, expect, it } from "vitest";

import {
  buildWorkspaceHomePath,
  buildWorkspaceSettingsPath,
  getPostBootstrapSettingsPath,
  getWorkspaceSelectionHeaders,
  getWorkspaceSlugFromPathname,
} from "./workspace";

describe("workspace helpers", () => {
  it("builds the URL-scoped settings path for a workspace", () => {
    expect(buildWorkspaceSettingsPath("acme-hq")).toBe("/w/acme-hq/settings");
  });

  it("builds the workspace home path", () => {
    expect(buildWorkspaceHomePath("acme-hq")).toBe("/w/acme-hq");
  });

  it("extracts the active workspace slug from the pathname", () => {
    expect(getWorkspaceSlugFromPathname("/w/acme-hq/settings")).toBe("acme-hq");
    expect(getWorkspaceSlugFromPathname("/settings")).toBeNull();
  });

  it("builds request headers for URL-scoped workspace routes", () => {
    const headers = getWorkspaceSelectionHeaders("/w/acme-hq/settings");

    expect(headers.get("x-gmacko-workspace-slug")).toBe("acme-hq");
  });

  it("omits workspace headers on non-workspace routes", () => {
    const headers = getWorkspaceSelectionHeaders("/settings");

    expect(headers.has("x-gmacko-workspace-slug")).toBe(false);
  });

  it("chooses the post-bootstrap destination based on tenancy mode", () => {
    expect(
      getPostBootstrapSettingsPath({
        tenancyMode: "multi-tenant",
        workspaceSlug: "acme-hq",
      }),
    ).toBe("/w/acme-hq/settings");

    expect(
      getPostBootstrapSettingsPath({
        tenancyMode: "single-tenant",
        workspaceSlug: "acme-hq",
      }),
    ).toBe("/settings");
  });
});
