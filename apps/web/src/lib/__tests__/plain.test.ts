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
