/**
 * Every shared error is a `Schema.TaggedError` that carries its HTTP status
 * in the schema, so the server, the generated client and the OpenAPI document
 * all agree on the code without a lookup table.
 */
import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";

import {
  Conflict,
  Forbidden,
  InternalError,
  NotFound,
  RateLimited,
  Unauthorized,
} from "../errors";

/** Reads the status an error schema is declared with, the way OpenAPI does. */
const statusOf = (error: Schema.Top): number | undefined => {
  const api = HttpApi.make("probe").add(
    HttpApiGroup.make("probe").add(
      HttpApiEndpoint.get("probe", "/probe", { error }),
    ),
  );
  let found: number | undefined;
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ errors }) => {
      found = [...errors.keys()][0];
    },
  });
  return found;
};

describe("shared errors", () => {
  it.each([
    [Unauthorized, 401],
    [Forbidden, 403],
    [NotFound, 404],
    [Conflict, 409],
    [RateLimited, 429],
    [InternalError, 500],
  ] as const)("%o is declared with status %i", (error, status) => {
    expect(statusOf(error)).toBe(status);
  });

  it("encodes the fields a client can act on", () => {
    const encode = <
      S extends Schema.ConstraintCodec<unknown, unknown, never, never>,
    >(
      schema: S,
      value: S["Type"],
    ) => Schema.encodeUnknownSync(Schema.toCodecJson(schema))(value);
    expect(encode(Forbidden, new Forbidden({ reason: "scope" }))).toEqual({
      _tag: "Forbidden",
      reason: "scope",
    });
    expect(
      encode(NotFound, new NotFound({ resource: "post", id: "p1" })),
    ).toEqual({ _tag: "NotFound", resource: "post", id: "p1" });
    expect(encode(Conflict, new Conflict({ reason: "invite-exists" }))).toEqual(
      { _tag: "Conflict", reason: "invite-exists" },
    );
    expect(
      encode(RateLimited, new RateLimited({ retryAfterSeconds: 30 })),
    ).toEqual({ _tag: "RateLimited", retryAfterSeconds: 30 });
    expect(encode(Unauthorized, new Unauthorized())).toEqual({
      _tag: "Unauthorized",
    });
    expect(encode(InternalError, new InternalError())).toEqual({
      _tag: "InternalError",
    });
  });

  it("never leaks detail through InternalError", () => {
    const error = new InternalError();
    expect(error.message).toBe("Internal server error");
    expect(Object.keys(error)).not.toContain("cause");
  });
});
