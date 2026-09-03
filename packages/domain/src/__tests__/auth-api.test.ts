import { describe, expect, it } from "vitest";

import { AuthApi } from "../auth";
import { inspectGroup, routeTable } from "./helpers";

describe("AuthApi", () => {
  it("exposes the session publicly and the smoke endpoint to any credential", () => {
    expect(routeTable(inspectGroup(AuthApi))).toEqual([
      {
        id: "session",
        method: "GET",
        path: "/auth/session",
        credential: "public",
        roles: [],
        success: 200,
        errors: [],
      },
      {
        id: "secret",
        method: "GET",
        path: "/auth/secret",
        credential: "SessionOrKey(read)",
        roles: [],
        success: 200,
        errors: ["401 Unauthorized", "403 Forbidden"],
      },
    ]);
  });
});
