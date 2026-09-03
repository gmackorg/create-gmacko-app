import { Schema } from "effect";
import { HttpApi, type HttpApiGroup } from "effect/unstable/httpapi";

import { type EndpointInfo, inspectApi } from "../inspect";

/** JSON codec helpers for round-trip tests. */
export const json = <
  S extends Schema.ConstraintCodec<unknown, unknown, never, never>,
>(
  schema: S,
) => {
  const codec = Schema.toCodecJson(schema);
  return {
    encode: Schema.encodeUnknownSync(codec),
    decode: Schema.decodeUnknownSync(codec),
  };
};

/** Encodes then decodes; the result must equal the input. */
export const roundTrip = <
  S extends Schema.ConstraintCodec<unknown, unknown, never, never>,
>(
  schema: S,
  value: S["Type"],
): S["Type"] => {
  const { encode, decode } = json(schema);
  return decode(encode(value));
};

/** Reflects one group as if it were the whole API (no `/api` prefix). */
export const inspectGroup = (
  group: HttpApiGroup.Constraint,
): ReadonlyArray<EndpointInfo> =>
  inspectApi(HttpApi.make("probe").add(group) as unknown as HttpApi.Top);

/** The columns a contract test asserts on. */
export const routeTable = (rows: ReadonlyArray<EndpointInfo>) =>
  rows.map((row) => ({
    id: row.id,
    method: row.method,
    path: row.path,
    credential: row.credential,
    roles: row.roles,
    success: row.successStatus,
    errors: row.errors.map((e) => `${e.status} ${e.tag}`),
  }));
