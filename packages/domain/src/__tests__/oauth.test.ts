import { describe, expect, it } from "vitest";

import { WorkspaceId } from "../models/ids";
import {
  OAuthApi,
  OAuthWorkspace,
  OAuthWorkspaceChoice,
  SelectOAuthWorkspace,
} from "../oauth";
import { inspectGroup, roundTrip, routeTable } from "./helpers";

describe("OAuthWorkspaceChoice", () => {
  it("round-trips, with no selection yet", () => {
    const choice = new OAuthWorkspaceChoice({
      workspaces: [
        new OAuthWorkspace({
          id: WorkspaceId.make("w1"),
          name: "Acme",
          role: "owner",
        }),
      ],
      selected: null,
    });
    expect(roundTrip(OAuthWorkspaceChoice, choice)).toEqual(choice);
  });

  it("refuses a role outside the membership roles", () => {
    expect(
      () =>
        new OAuthWorkspace({
          id: WorkspaceId.make("w1"),
          name: "Acme",
          // SAFETY: deliberately out of contract; the constructor must refuse it.
          role: "superuser" as never,
        }),
    ).toThrow();
  });
});

describe("OAuthApi", () => {
  it("is session only: the picker acts on the browser session, never a bearer", () => {
    expect(routeTable(inspectGroup(OAuthApi))).toEqual([
      {
        id: "workspaces",
        method: "GET",
        path: "/oauth/workspaces",
        credential: "Session",
        roles: [],
        success: 200,
        errors: ["401 Unauthorized", "403 Forbidden"],
      },
      {
        id: "selectWorkspace",
        method: "PUT",
        path: "/oauth/workspace",
        credential: "Session",
        roles: [],
        success: 200,
        errors: ["401 Unauthorized", "403 Forbidden", "404 NotFound"],
      },
    ]);
    expect(
      new SelectOAuthWorkspace({ workspaceId: WorkspaceId.make("w1") })
        .workspaceId,
    ).toBe("w1");
  });
});
