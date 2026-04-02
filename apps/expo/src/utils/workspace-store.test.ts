import { describe, expect, it } from "vitest";

import { buildWorkspaceRequestHeaders } from "./workspace";

describe("workspace store helpers", () => {
  it("adds the active workspace id to request headers", () => {
    const headers = buildWorkspaceRequestHeaders("workspace_123");

    expect(headers.get("x-gmacko-workspace-id")).toBe("workspace_123");
  });

  it("skips workspace headers when there is no active workspace", () => {
    const headers = buildWorkspaceRequestHeaders(null);

    expect(headers.has("x-gmacko-workspace-id")).toBe(false);
  });
});
