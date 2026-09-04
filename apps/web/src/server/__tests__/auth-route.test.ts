/**
 * `/api/auth/*` is shared: the contract's `auth` group owns a few
 * method+path pairs, better-auth owns the rest. The split lives in
 * `~/server/auth-dispatch`, which has no Worker runtime in it, so the suite
 * imports the real functions and injects the two handlers.
 */
import { AppApi } from "@gmacko/domain";
import { describe, expect, it } from "vitest";

import {
  authRateLimitScope,
  authRouteOptions,
  contractAuthRoutes,
  isContractAuthRequest,
  makeAuthDispatch,
  matchesPathTemplate,
} from "~/server/auth-dispatch";

const ORIGIN = "http://localhost";

const dispatch = () => {
  const seen: Array<{ target: "api" | "auth"; request: Request }> = [];
  const handle = makeAuthDispatch({
    api: (request) => {
      seen.push({ target: "api", request });
      return Promise.resolve(new Response("api"));
    },
    auth: (request) => {
      seen.push({ target: "auth", request });
      return Promise.resolve(new Response("auth"));
    },
  });
  return { handle, seen };
};

describe("matchesPathTemplate", () => {
  it("matches literal segments exactly, ignoring a trailing slash", () => {
    expect(matchesPathTemplate("/api/auth/session", "/api/auth/session")).toBe(
      true,
    );
    expect(matchesPathTemplate("/api/auth/session", "/api/auth/session/")).toBe(
      true,
    );
    expect(matchesPathTemplate("/api/auth/session", "/api/auth/sessions")).toBe(
      false,
    );
    expect(matchesPathTemplate("/api/auth/session", "/api/auth")).toBe(false);
    expect(
      matchesPathTemplate("/api/auth/session", "/api/auth/session/extra"),
    ).toBe(false);
  });

  it("binds a :param segment to any one non-empty segment", () => {
    expect(matchesPathTemplate("/api/auth/keys/:id", "/api/auth/keys/k1")).toBe(
      true,
    );
    expect(matchesPathTemplate("/api/auth/keys/:id", "/api/auth/keys")).toBe(
      false,
    );
    expect(
      matchesPathTemplate("/api/auth/keys/:id", "/api/auth/keys/k1/more"),
    ).toBe(false);
    expect(
      matchesPathTemplate("/api/auth/:a/:b/x", "/api/auth/one/two/x"),
    ).toBe(true);
  });

  it("lets a trailing * take the rest", () => {
    expect(matchesPathTemplate("/api/auth/*", "/api/auth/anything/here")).toBe(
      true,
    );
    expect(matchesPathTemplate("/api/auth/*", "/api/auth")).toBe(false);
  });
});

describe("/api/auth/$ dispatch", () => {
  it("lists every endpoint of the contract's auth group, prefixed", () => {
    const endpoints = Object.values(AppApi.groups.auth.endpoints);
    expect(endpoints.length).toBeGreaterThan(0);
    expect(contractAuthRoutes).toHaveLength(endpoints.length);
    for (const route of contractAuthRoutes) {
      expect(route.path.startsWith("/api/auth/")).toBe(true);
    }
  });

  it("sends every contract auth endpoint to the HttpApi for its own method", async () => {
    for (const endpoint of Object.values(AppApi.groups.auth.endpoints)) {
      const { handle, seen } = dispatch();
      const pathname = endpoint.path.replace(/:[^/]+/g, "x");
      const response = await handle(
        new Request(`${ORIGIN}${pathname}`, { method: endpoint.method }),
      );
      expect(await response.text()).toBe("api");
      expect(seen.map((entry) => entry.target)).toEqual(["api"]);
      expect(isContractAuthRequest(endpoint.method, pathname)).toBe(true);
      expect(
        isContractAuthRequest(endpoint.method.toLowerCase(), pathname),
      ).toBe(true);
    }
  });

  it("does not claim a contract path for a method the contract lacks", async () => {
    const endpoint = AppApi.groups.auth.endpoints.session;
    expect(endpoint.method).toBe("GET");
    const { handle, seen } = dispatch();
    await handle(new Request(`${ORIGIN}${endpoint.path}`, { method: "POST" }));
    expect(seen.map((entry) => entry.target)).toEqual(["auth"]);
  });

  it("sends an unknown /api/auth path to better-auth, whatever the method", async () => {
    for (const [method, path] of [
      ["POST", "/api/auth/sign-in/social"],
      ["GET", "/api/auth/callback/github"],
      ["POST", "/api/auth/sign-out"],
      ["GET", "/api/auth/get-session"],
      ["DELETE", "/api/auth/session"],
      ["OPTIONS", "/api/auth/session"],
      ["GET", "/api/auth/session/refresh"],
    ] as const) {
      const { handle, seen } = dispatch();
      const response = await handle(
        new Request(`${ORIGIN}${path}?q=1`, { method }),
      );
      expect(await response.text()).toBe("auth");
      expect(seen.map((entry) => entry.target)).toEqual(["auth"]);
    }
  });

  it("counts better-auth's writes, and only its writes", () => {
    // The two global-counter paths: they create an account or send mail.
    expect(authRateLimitScope("POST", "/api/auth/sign-in/magic-link")).toBe(
      "signup",
    );
    expect(authRateLimitScope("post", "/api/auth/sign-in/magic-link/")).toBe(
      "signup",
    );
    expect(authRateLimitScope("POST", "/api/auth/sign-up/email")).toBe(
      "signup",
    );
    // Every other write goes to the binding-backed scope.
    expect(authRateLimitScope("POST", "/api/auth/sign-in/social")).toBe("auth");
    expect(authRateLimitScope("POST", "/api/auth/sign-out")).toBe("auth");
    // Reads are not counted here.
    expect(authRateLimitScope("GET", "/api/auth/get-session")).toBeNull();
    expect(authRateLimitScope("GET", "/api/auth/callback/github")).toBeNull();
    expect(authRateLimitScope("OPTIONS", "/api/auth/session")).toBeNull();
  });

  it("answers the guard's 429 instead of calling better-auth", async () => {
    const seen: Array<string> = [];
    const handle = makeAuthDispatch({
      api: () => Promise.resolve(new Response("api")),
      auth: () => Promise.resolve(new Response("auth")),
      guard: (scope) => {
        seen.push(scope);
        return Promise.resolve(
          new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
        );
      },
    });
    const response = await handle(
      new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST" }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(seen).toEqual(["signup"]);
  });

  it("never asks the guard about a contract endpoint (the middleware owns it)", async () => {
    const seen: Array<string> = [];
    const handle = makeAuthDispatch({
      api: () => Promise.resolve(new Response("api")),
      auth: () => Promise.resolve(new Response("auth")),
      guard: (scope) => {
        seen.push(scope);
        return Promise.resolve(null);
      },
    });
    const endpoint = AppApi.groups.auth.endpoints.session;
    const response = await handle(
      new Request(`${ORIGIN}${endpoint.path}`, { method: endpoint.method }),
    );
    expect(await response.text()).toBe("api");
    expect(seen).toEqual([]);
  });

  it("registers a single ANY handler on the route", async () => {
    const seen: Array<string> = [];
    const options = authRouteOptions({
      api: (request) => {
        seen.push(request.method);
        return Promise.resolve(new Response("api"));
      },
      auth: (request) => {
        seen.push(request.method);
        return Promise.resolve(new Response("auth"));
      },
    });
    const handlers = options.server.handlers;
    expect(Object.keys(handlers)).toEqual(["ANY"]);
    const response = await handlers.ANY({
      request: new Request(`${ORIGIN}/api/auth/sign-out`, { method: "POST" }),
    });
    expect(await response.text()).toBe("auth");
    expect(seen).toEqual(["POST"]);
  });
});
