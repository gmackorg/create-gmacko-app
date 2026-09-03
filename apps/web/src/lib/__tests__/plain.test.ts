import { LaunchState, Post } from "@gmacko/domain";
import { describe, expect, it } from "vitest";

import { toPlain } from "../plain";

describe("toPlain", () => {
  it("flattens Schema.Class instances to plain objects, keeping Dates", () => {
    const createdAt = new Date("2026-09-03T00:00:00.000Z");
    const post = new Post({
      id: "p1" as never,
      title: "T",
      content: "C",
      createdAt,
      updatedAt: null,
    });
    const plain = toPlain([post]) as Array<Record<string, unknown>>;
    expect(Object.getPrototypeOf(plain[0])).toBe(Object.prototype);
    expect(plain[0]).toEqual({
      id: "p1",
      title: "T",
      content: "C",
      createdAt,
      updatedAt: null,
    });
    expect(plain[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("walks nested objects and arrays and leaves primitives alone", () => {
    const state = new LaunchState({
      announcementMessage: null,
      announcementTone: "info",
      allowedEmailDomains: ["a.com"],
      canAutoCreateAccounts: true,
      inviteOnly: false,
      maintenanceMode: false,
      signupEnabled: true,
      stripeConfigured: false,
      publicAnnouncementVisible: false,
      canUseWaitlist: true,
    });
    expect(toPlain({ state, n: 1, s: "x", b: true, u: undefined })).toEqual({
      state: { ...state },
      n: 1,
      s: "x",
      b: true,
      u: undefined,
    });
    expect(toPlain(null)).toBeNull();
    expect(toPlain("str")).toBe("str");
  });
});

describe("toPlain refuses what Object.entries would silently empty", () => {
  it.each([
    ["Map", new Map([["a", 1]])],
    ["Set", new Set([1])],
    ["WeakMap", new WeakMap()],
    ["WeakSet", new WeakSet()],
    ["Uint8Array", new Uint8Array([1, 2])],
    ["Float64Array", new Float64Array(2)],
    ["DataView", new DataView(new ArrayBuffer(4))],
    ["ArrayBuffer", new ArrayBuffer(4)],
  ])("throws for a %s, at the top level and nested", (name, value) => {
    expect(() => toPlain(value)).toThrow(TypeError);
    expect(() => toPlain(value)).toThrow(name);
    expect(() => toPlain({ nested: [{ value }] })).toThrow(TypeError);
  });

  it("still flattens plain objects with those names as keys", () => {
    expect(toPlain({ Map: 1, Set: [2] })).toEqual({ Map: 1, Set: [2] });
  });
});
