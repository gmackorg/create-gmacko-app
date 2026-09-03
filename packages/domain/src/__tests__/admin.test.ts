import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AdminApi,
  AdminStats,
  AdminWorkspace,
  ApplicationSettings,
  ApplicationSettingsId,
  BootstrapCompleted,
  BootstrapStatus,
  CompleteBootstrap,
  LaunchControls,
  ListUsersQuery,
  ReviewWaitlistEntry,
  UpdateLaunchControls,
  UpdateUserRole,
  UserList,
} from "../admin";
import { User, UserId } from "../auth";
import { Workspace, WorkspaceId } from "../settings";
import { inspectGroup, json, roundTrip, routeTable } from "./helpers";

const t0 = new Date("2026-01-01T00:00:00.000Z");
const userId = UserId.make("u1");
const workspaceId = WorkspaceId.make("w1");
const user = new User({
  id: userId,
  name: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  image: null,
  role: "admin",
  createdAt: t0,
  updatedAt: t0,
});
const settings = new ApplicationSettings({
  id: ApplicationSettingsId.make("s1"),
  setupCompletedAt: t0,
  setupCompletedByUserId: userId,
  initialWorkspaceId: workspaceId,
  maintenanceMode: false,
  signupEnabled: true,
  announcementMessage: "Hi",
  announcementTone: "warning",
  allowedEmailDomains: ["example.com"],
  createdAt: t0,
  updatedAt: null,
});
const workspace = new Workspace({
  id: workspaceId,
  name: "Acme",
  slug: "acme",
  ownerUserId: userId,
  createdAt: t0,
  updatedAt: null,
});

describe("payloads", () => {
  it("UpdateLaunchControls is a partial; null clears the announcement", () => {
    const decoded = json(UpdateLaunchControls).decode({
      announcementMessage: null,
    });
    expect(Object.keys(decoded)).toEqual(["announcementMessage"]);
    expect(decoded.announcementMessage).toBeNull();
    expect(
      () => new UpdateLaunchControls({ announcementMessage: "x".repeat(2001) }),
    ).toThrow();
    expect(
      () => new UpdateLaunchControls({ allowedEmailDomains: [""] }),
    ).toThrow();
    expect(
      () => new UpdateLaunchControls({ announcementTone: "loud" as never }),
    ).toThrow();
  });

  it("ListUsersQuery decodes from query strings with defaults and bounds", () => {
    const decode = Schema.decodeUnknownSync(
      Schema.toCodecStringTree(ListUsersQuery),
    );
    expect(decode({})).toEqual({ limit: 20, offset: 0 });
    expect(decode({ limit: "5", offset: "10" })).toEqual({
      limit: 5,
      offset: 10,
    });
    expect(() => decode({ limit: "0" })).toThrow();
    expect(() => decode({ limit: "101" })).toThrow();
    expect(() => decode({ offset: "-1" })).toThrow();
    expect(() => decode({ limit: "1.5" })).toThrow();
  });

  it("CompleteBootstrap needs a workspace name of 2..120", () => {
    expect(() => new CompleteBootstrap({ workspaceName: "A" })).toThrow();
    expect(
      () => new CompleteBootstrap({ workspaceName: "x".repeat(121) }),
    ).toThrow();
    expect(new CompleteBootstrap({ workspaceName: "Acme" }).workspaceName).toBe(
      "Acme",
    );
  });

  it("ReviewWaitlistEntry and UpdateUserRole take the enum only", () => {
    expect(
      () => new ReviewWaitlistEntry({ status: "archived" as never }),
    ).toThrow();
    expect(() => new UpdateUserRole({ role: "root" as never })).toThrow();
  });
});

describe("responses round-trip through JSON", () => {
  it.each<[string, Schema.Top, unknown]>([
    ["ApplicationSettings", ApplicationSettings, settings],
    [
      "LaunchControls",
      LaunchControls,
      new LaunchControls({
        maintenanceMode: false,
        signupEnabled: true,
        announcementMessage: null,
        announcementTone: "info",
        allowedEmailDomains: [],
        platformPrimitives: {
          featureFlags: { enabled: true, provider: "local" },
          jobs: { enabled: false, provider: "local" },
          rateLimits: { enabled: true, scopes: [] },
          botProtection: { enabled: true, provider: "local-rate-limit" },
          compliance: { enabled: true, dataExport: false, dataDeletion: true },
          emailDelivery: { enabled: false, provider: "none", requiredEnv: [] },
        },
        waitlistCount: 3,
      }),
    ],
    [
      "BootstrapStatus",
      BootstrapStatus,
      new BootstrapStatus({
        isInitialized: false,
        requiresSetup: true,
        hasExistingWorkspace: false,
        setupCompletedAt: null,
        initialWorkspaceId: null,
      }),
    ],
    [
      "BootstrapCompleted",
      BootstrapCompleted,
      new BootstrapCompleted({ settings, workspace }),
    ],
    [
      "AdminStats",
      AdminStats,
      new AdminStats({
        totalUsers: 2,
        totalWorkspaces: 1,
        adminUsers: 1,
        regularUsers: 1,
      }),
    ],
    [
      "AdminWorkspace",
      AdminWorkspace,
      new AdminWorkspace({
        id: workspaceId,
        name: "Acme",
        slug: "acme",
        ownerUserId: userId,
        membershipCount: 1,
        createdAt: t0,
      }),
    ],
    [
      "UserList",
      UserList,
      new UserList({ users: [user], total: 1, hasMore: false }),
    ],
  ])("%s", (_name, schema, value) => {
    expect(
      roundTrip(
        schema as unknown as Schema.ConstraintCodec<
          unknown,
          unknown,
          never,
          never
        >,
        value,
      ),
    ).toEqual(value);
  });
});

describe("AdminApi", () => {
  it("declares the eleven admin endpoints with their credentials", () => {
    const credentialErrors = ["401 Unauthorized", "403 Forbidden"];
    /** Every `/admin/*` endpoint also counts against the operator-api rate limit. */
    const adminErrors = [...credentialErrors, "429 RateLimited"];
    const admin = {
      credential: "SessionOrKey(admin)",
      roles: ["AdminOnly"],
    };
    expect(routeTable(inspectGroup(AdminApi))).toEqual([
      {
        id: "launchControls",
        method: "GET",
        path: "/admin/launch-controls",
        ...admin,
        success: 200,
        errors: adminErrors,
      },
      {
        id: "updateLaunchControls",
        method: "PATCH",
        path: "/admin/launch-controls",
        ...admin,
        success: 200,
        errors: adminErrors,
      },
      {
        id: "listWaitlistEntries",
        method: "GET",
        path: "/admin/waitlist",
        ...admin,
        success: 200,
        errors: adminErrors,
      },
      {
        id: "reviewWaitlistEntry",
        method: "POST",
        path: "/admin/waitlist/:id/review",
        ...admin,
        success: 200,
        errors: [
          ...credentialErrors,
          "404 NotFound",
          "409 Conflict",
          "429 RateLimited",
        ],
      },
      {
        id: "bootstrapStatus",
        method: "GET",
        path: "/bootstrap",
        credential: "public",
        roles: [],
        success: 200,
        errors: [],
      },
      {
        id: "completeBootstrap",
        method: "POST",
        path: "/bootstrap/complete",
        credential: "Session",
        roles: [],
        success: 201,
        errors: [...credentialErrors, "409 Conflict"],
      },
      {
        id: "stats",
        method: "GET",
        path: "/admin/stats",
        ...admin,
        success: 200,
        errors: adminErrors,
      },
      {
        id: "listWorkspaces",
        method: "GET",
        path: "/admin/workspaces",
        ...admin,
        success: 200,
        errors: adminErrors,
      },
      {
        id: "listUsers",
        method: "GET",
        path: "/admin/users",
        ...admin,
        success: 200,
        errors: adminErrors,
      },
      {
        id: "updateUserRole",
        method: "PATCH",
        path: "/admin/users/:userId/role",
        ...admin,
        success: 200,
        errors: [
          ...credentialErrors,
          "404 NotFound",
          "409 Conflict",
          "429 RateLimited",
        ],
      },
      {
        id: "getUser",
        method: "GET",
        path: "/admin/users/:userId",
        ...admin,
        success: 200,
        errors: [...credentialErrors, "404 NotFound", "429 RateLimited"],
      },
    ]);
  });
});
