import { describe, expect, it } from "vitest";

import { createOperatorExecutor } from "../core";

describe("mcp operator executor", () => {
  it("allows auth help without an API key", async () => {
    const executor = createOperatorExecutor({
      baseUrl: "http://localhost:3000",
    });

    await expect(executor.callTool("auth_help")).resolves.toContain(
      "browser-based OAuth or magic-link sign-in",
    );
  });

  it("rejects protected tools when no API key is configured", async () => {
    const executor = createOperatorExecutor({
      baseUrl: "http://localhost:3000",
    });

    expect(() => executor.callTool("get_workspace_context")).toThrow(
      "GMACKO_API_KEY environment variable is required for protected operator tools",
    );
  });
});
