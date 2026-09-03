/**
 * Scalar building blocks reused across groups: the branded-id helper and
 * the string constraints the old zod schemas enforced.
 */
import { Schema } from "effect";

/** A `text` primary key generated in the Worker; branded per table. */
export const id = <B extends string>(brand: B) =>
  Schema.String.pipe(Schema.brand(brand));

/** Same acceptance as zod's `z.string().email()`: one `@`, a dot in the domain, no whitespace. */
export const Email = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      identifier: "Email",
      description: "an email address",
    }),
    Schema.isMaxLength(254),
  ),
);
export type Email = typeof Email.Type;

/** `z.string().max(n)`. */
export const boundedString = (maxLength: number) =>
  Schema.String.pipe(Schema.check(Schema.isMaxLength(maxLength)));

/** `z.string().min(min).max(max)`. */
export const stringBetween = (minLength: number, maxLength: number) =>
  Schema.String.pipe(
    Schema.check(Schema.isMinLength(minLength), Schema.isMaxLength(maxLength)),
  );
