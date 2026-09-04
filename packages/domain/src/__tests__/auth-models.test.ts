/**
 * Auth models: the one `User` shape both credential kinds resolve to, the
 * session record without its token, and the magic-link form payload.
 */
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  MagicLinkRequest,
  MagicLinkRequestForm,
  SessionId,
  SessionRecord,
  SessionState,
  User,
  UserId,
} from "../auth";

const json = <S extends Schema.ConstraintCodec<unknown, unknown, never, never>>(
  schema: S,
) => {
  const codec = Schema.toCodecJson(schema);
  return {
    encode: Schema.encodeUnknownSync(codec),
    decode: Schema.decodeUnknownSync(codec),
  };
};

const user = new User({
  id: UserId.make("u1"),
  name: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  image: null,
  role: "admin",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
});

describe("User", () => {
  it("round-trips through JSON with ISO dates", () => {
    const { encode, decode } = json(User);
    const encoded = encode(user);
    expect(encoded).toEqual({
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      emailVerified: true,
      image: null,
      role: "admin",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const decoded = decode(encoded);
    expect(decoded).toBeInstanceOf(User);
    expect(decoded).toEqual(user);
  });

  it("rejects an unknown role", () => {
    const { decode } = json(User);
    // SAFETY: `toCodecJson` types every encoded value as `Json`, whose union
    // includes primitives; a `Schema.Class` encodes to the object arm of that
    // union -- its struct fields, keyed by name -- which is what makes the
    // spread below well-formed.
    const encoded = json(User).encode(user) as Schema.JsonObject;
    expect(() => decode({ ...encoded, role: "superuser" })).toThrow();
  });
});

describe("SessionRecord", () => {
  it("never carries the token", () => {
    expect(Object.keys(SessionRecord.fields)).not.toContain("token");
    const { encode, decode } = json(SessionRecord);
    const session = new SessionRecord({
      id: SessionId.make("s1"),
      userId: UserId.make("u1"),
      expiresAt: new Date("2026-02-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      ipAddress: null,
      userAgent: "curl",
    });
    expect(decode(encode(session))).toEqual(session);
  });
});

describe("SessionState", () => {
  it("is anonymous, or a user with the credential that resolved it", () => {
    const { encode, decode } = json(SessionState);
    const anonymous = new SessionState({ user: null, credential: null });
    expect(encode(anonymous)).toEqual({ user: null, credential: null });
    const keyed = new SessionState({ user, credential: "key" });
    expect(decode(encode(keyed))).toEqual(keyed);
  });
});

describe("MagicLinkRequest", () => {
  it("validates the email as a Standard Schema for TanStack Form", async () => {
    const ok = await MagicLinkRequestForm["~standard"].validate({
      email: "ada@example.com",
    });
    expect("issues" in ok && ok.issues).toBeFalsy();
    const bad = await MagicLinkRequestForm["~standard"].validate({
      email: "not-an-email",
    });
    expect("issues" in bad && bad.issues?.length).toBeGreaterThan(0);
    expect(() => new MagicLinkRequest({ email: "nope" })).toThrow();
  });
});
