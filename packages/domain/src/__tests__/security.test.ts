/**
 * The credential declarations: which cookie / header each middleware reads,
 * that each scope has exactly one tag identity, and which are *security*
 * middlewares (the ones the credential-matrix and OpenAPI count).
 */
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";

import { Forbidden, Unauthorized } from "../errors";
import {
  AdminOnly,
  ApiKeyScope,
  CurrentUser,
  Session,
  SessionOrKey,
  sessionCookieName,
  WorkspaceRole,
} from "../security";

/** `isSecurity` is typed against `AnyService`, which the class type does not name structurally. */
const isSecurity = (middleware: object) =>
  HttpApiMiddleware.isSecurity(middleware as HttpApiMiddleware.AnyService);

describe("sessionCookieName", () => {
  it("is better-auth's cookie, __Secure- prefixed only over https", () => {
    expect(sessionCookieName(false)).toBe("better-auth.session_token");
    expect(sessionCookieName(true)).toBe("__Secure-better-auth.session_token");
  });
});

describe("CurrentUser", () => {
  it("is the request-scoped service the middlewares provide", () => {
    expect(CurrentUser.key).toBe("@gmacko/domain/CurrentUser");
  });
});

describe("Session", () => {
  it("reads the session cookie and nothing else", () => {
    expect(isSecurity(Session)).toBe(true);
    expect(Object.keys(Session.security)).toEqual(["session"]);
    expect(Session.security.session).toMatchObject({
      _tag: "ApiKey",
      in: "cookie",
      key: "better-auth.session_token",
    });
    expect([...Session.error]).toEqual([Unauthorized, Forbidden]);
  });
});

describe("SessionOrKey", () => {
  it("accepts the session cookie or a bearer key, per scope", () => {
    for (const scope of ApiKeyScope.literals) {
      const middleware = SessionOrKey(scope);
      expect(isSecurity(middleware)).toBe(true);
      expect(Object.keys(middleware.security)).toEqual(["session", "apiKey"]);
      expect(middleware.security.session).toBe(Session.security.session);
      expect(middleware.security.apiKey).toMatchObject({
        _tag: "Http",
      });
      expect(middleware.security.apiKey.scheme.toLowerCase()).toBe("bearer");
      expect(middleware.scope).toBe(scope);
      expect(middleware.key).toBe(`@gmacko/domain/SessionOrKey/${scope}`);
      expect([...middleware.error]).toEqual([Unauthorized, Forbidden]);
    }
  });

  it("has exactly one tag identity per scope", () => {
    expect(SessionOrKey("read")).toBe(SessionOrKey("read"));
    expect(SessionOrKey("write")).toBe(SessionOrKey("write"));
    expect(SessionOrKey("read")).not.toBe(SessionOrKey("write"));
    expect(new Set(ApiKeyScope.literals.map(SessionOrKey)).size).toBe(4);
  });
});

describe("role middlewares", () => {
  it("AdminOnly layers on CurrentUser and is not a security scheme", () => {
    expect(isSecurity(AdminOnly)).toBe(false);
    expect(AdminOnly.key).toBe("@gmacko/domain/AdminOnly");
    expect([...AdminOnly.error]).toEqual([Forbidden]);
  });

  it("WorkspaceRole(min) has one identity per minimum role", () => {
    expect(WorkspaceRole("admin")).toBe(WorkspaceRole("admin"));
    expect(WorkspaceRole("admin")).not.toBe(WorkspaceRole("owner"));
    expect(isSecurity(WorkspaceRole("member"))).toBe(false);
    expect(WorkspaceRole("admin").key).toBe(
      "@gmacko/domain/WorkspaceRole/admin",
    );
    expect(WorkspaceRole("admin").minimum).toBe("admin");
    expect([...WorkspaceRole("owner").error]).toEqual([Forbidden]);
  });
});
