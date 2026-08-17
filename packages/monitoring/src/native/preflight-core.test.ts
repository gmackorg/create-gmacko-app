import { describe, expect, it } from "vitest";

import {
  BreadcrumbBuffer,
  buildErrorEvent,
  generateEventId,
  type PreflightDeviceContext,
  parseStack,
  preflightIngestUrl,
} from "./preflight-core";

const deviceCtx: PreflightDeviceContext = {
  platform: "ios",
  release: "1.2.3+45",
  appVersion: "1.2.3",
  osName: "iOS",
  osVersion: "17.4",
  deviceModel: "iPhone15,2",
  sessionId: "session-abc",
  sdk: { name: "preflight-expo", version: "0.1.0" },
};

describe("preflightIngestUrl", () => {
  it("builds the errors path and trims trailing slashes", () => {
    expect(
      preflightIngestUrl("https://preflight.forgegraph.com", "app_1"),
    ).toBe(
      "https://preflight.forgegraph.com/api/preflight/v1/apps/app_1/errors",
    );
    expect(preflightIngestUrl("https://example.com///", "app_1")).toBe(
      "https://example.com/api/preflight/v1/apps/app_1/errors",
    );
  });

  it("url-encodes the app id", () => {
    expect(preflightIngestUrl("https://x.io", "a b/c")).toBe(
      "https://x.io/api/preflight/v1/apps/a%20b%2Fc/errors",
    );
  });
});

describe("parseStack", () => {
  it("returns [] for missing / non-string stacks", () => {
    expect(parseStack(undefined)).toEqual([]);
    expect(parseStack(null)).toEqual([]);
    expect(parseStack("")).toEqual([]);
  });

  it("parses V8-style frames and marks node_modules as not inApp", () => {
    const stack = [
      "TypeError: boom",
      "    at doThing (/app/src/screens/Home.tsx:10:5)",
      "    at /app/node_modules/react-native/Libraries/Foo.js:22:9",
    ].join("\n");

    const frames = parseStack(stack);
    // The message line is skipped; most-recent frame first.
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      function: "doThing",
      filename: "/app/src/screens/Home.tsx",
      lineno: 10,
      colno: 5,
      inApp: true,
    });
    expect(frames[1]).toMatchObject({
      filename: "/app/node_modules/react-native/Libraries/Foo.js",
      lineno: 22,
      colno: 9,
      inApp: false,
    });
    expect(frames[1]?.function).toBeUndefined();
  });

  it("parses JSC/Hermes (fn@file:line:col) frames", () => {
    const stack = [
      "renderHome@/app/src/App.tsx:5:12",
      "@/app/node_modules/expo/build/Expo.js:1:1",
    ].join("\n");

    const frames = parseStack(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      function: "renderHome",
      filename: "/app/src/App.tsx",
      lineno: 5,
      colno: 12,
      inApp: true,
    });
    expect(frames[1]?.inApp).toBe(false);
    expect(frames[1]?.function).toBeUndefined();
  });
});

describe("buildErrorEvent", () => {
  it("builds a wire event from an Error with fixed provider/runtime", () => {
    const error = new TypeError("cannot read x");
    error.stack =
      "TypeError: cannot read x\n    at handler (/app/src/index.ts:3:1)";

    const event = buildErrorEvent(error, {}, deviceCtx);

    expect(event.provider).toBe("preflight");
    expect(event.runtime).toBe("expo");
    expect(event.type).toBe("TypeError");
    expect(event.message).toBe("cannot read x");
    expect(event.level).toBe("error");
    expect(event.isFatal).toBe(false);
    expect(event.platform).toBe("ios");
    expect(event.release).toBe("1.2.3+45");
    expect(event.osName).toBe("iOS");
    expect(event.deviceModel).toBe("iPhone15,2");
    expect(event.sessionId).toBe("session-abc");
    expect(event.sdk).toEqual({ name: "preflight-expo", version: "0.1.0" });
    expect(event.stack?.[0]).toMatchObject({
      function: "handler",
      inApp: true,
    });
    expect(typeof event.providerEventId).toBe("string");
    expect(event.providerEventId).not.toHaveLength(0);
    expect(typeof event.occurredAt).toBe("string");
  });

  it("defaults level to fatal when isFatal is set", () => {
    const event = buildErrorEvent(
      new Error("dead"),
      { isFatal: true },
      deviceCtx,
    );
    expect(event.isFatal).toBe(true);
    expect(event.level).toBe("fatal");
  });

  it("honours explicit level/context/breadcrumbs and a supplied event id", () => {
    const event = buildErrorEvent(
      new Error("warn"),
      {
        level: "warning",
        context: { screen: "Home" },
        breadcrumbs: [{ message: "tapped", category: "ui" }],
        providerEventId: "fixed-id",
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
      deviceCtx,
    );
    expect(event.level).toBe("warning");
    expect(event.context).toEqual({ screen: "Home" });
    expect(event.breadcrumbs).toEqual([{ message: "tapped", category: "ui" }]);
    expect(event.providerEventId).toBe("fixed-id");
    expect(event.occurredAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("normalizes non-Error throwables (string / plain object)", () => {
    const fromString = buildErrorEvent("just a string", {}, deviceCtx);
    expect(fromString.type).toBe("Error");
    expect(fromString.message).toBe("just a string");
    expect(fromString.stack).toEqual([]);

    const fromObject = buildErrorEvent(
      { name: "CustomError", message: "obj message" },
      {},
      deviceCtx,
    );
    expect(fromObject.type).toBe("CustomError");
    expect(fromObject.message).toBe("obj message");
  });

  it("omits device fields that are absent", () => {
    const event = buildErrorEvent(new Error("x"), {}, {});
    expect(event.platform).toBeUndefined();
    expect(event.release).toBeUndefined();
    expect(event.osName).toBeUndefined();
    // sdk still gets a default identity
    expect(event.sdk?.name).toBe("preflight-expo");
  });
});

describe("generateEventId", () => {
  it("produces distinct v4-shaped ids", () => {
    const a = generateEventId();
    const b = generateEventId();
    expect(a).not.toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("BreadcrumbBuffer", () => {
  it("keeps only the newest entries up to maxSize", () => {
    const buffer = new BreadcrumbBuffer(2);
    buffer.add({ message: "one" });
    buffer.add({ message: "two" });
    buffer.add({ message: "three" });
    const snap = buffer.snapshot();
    expect(snap.map((b) => b.message)).toEqual(["two", "three"]);
    // timestamp is auto-filled
    expect(typeof snap[0]?.timestamp).toBe("string");
  });

  it("preserves an explicit timestamp and clears", () => {
    const buffer = new BreadcrumbBuffer(5);
    buffer.add({ message: "one", timestamp: "2026-01-01T00:00:00.000Z" });
    expect(buffer.snapshot()[0]?.timestamp).toBe("2026-01-01T00:00:00.000Z");
    buffer.clear();
    expect(buffer.snapshot()).toEqual([]);
  });
});
