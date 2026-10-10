// The one body the compiler does not derive. CRUD resources run on the host.
// A function needs this registration. A real integration replaces the body.

import { defineFunction } from "@forgegraph/runtime";
import { Effect, Schema } from "effect";

const Notice = Schema.Struct({
  customer: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  ),
  event: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  ),
});

const decodeNotice = Schema.decodeUnknownEffect(Notice);

export const notifyPartner = defineFunction(
  "@gmacko/api/_/NotifyPartner",
  (deps) =>
    Effect.gen(function* () {
      const decoded = yield* decodeNotice(deps.input).pipe(
        Effect.catch(() => Effect.succeed(null)),
      );
      if (decoded === null) return { accepted: false };
      const customers = deps.resources["Customer"];
      if (customers === undefined) return { accepted: false };
      return yield* customers.get(decoded.customer).pipe(
        Effect.as({ accepted: true }),
        Effect.catch(() => Effect.succeed({ accepted: false })),
      );
    }),
);
