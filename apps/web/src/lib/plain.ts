/**
 * Query data crosses from the server render to the browser through TanStack
 * Start's serializer (seroval), which refuses class instances. The contract
 * decodes responses into `Schema.Class` instances (`Post`, `LaunchState`,
 * ...), so the QueryClient's `dehydrate.serializeData` flattens them to the
 * structurally identical plain object first. Dates stay Dates (seroval
 * carries them natively); arrays and nested objects are walked.
 *
 * Collections and binary values are refused rather than flattened: walking a
 * `Map`, `Set`, typed array or `ArrayBuffer` with `Object.entries` yields
 * `{}` (or an index-keyed object), which would ship silently empty data to
 * the browser. A contract model that needs one must convert it explicitly.
 */

/**
 * What `toPlain` returns: the value it was given, with every class instance
 * replaced by a structurally identical plain object. Everything `typeof`
 * reports as not an object passes straight through, which is why the union
 * names the primitives — and functions, which this walk has never touched
 * and which seroval refuses on its own.
 */
export type Flattened =
  | bigint
  | boolean
  | number
  | string
  | symbol
  | null
  | undefined
  | ((...args: never[]) => void)
  | Date
  | ReadonlyArray<Flattened>
  | { readonly [key: string]: Flattened };

// `toPlain` is itself the decoder for TanStack's `serializeData` seam, which
// hands it whatever a query resolved to; `unknown` in and `Flattened` out is
// exactly the parse this module performs, so there is no earlier boundary to
// move it to.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export const toPlain = (value: unknown): Flattened => {
  // The primitive/object split is this walk's whole subject: seroval carries
  // one kind unchanged and refuses the other, and `typeof` is the only
  // predicate that separates them without also re-classifying functions.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (value === null || typeof value !== "object") {
    // SAFETY: this branch is null plus everything `typeof` reports as not an
    // object, which is exactly the set of arms `Flattened` passes through.
    // TypeScript spells the function arm of that narrowing as `Function`,
    // which no call signature is assignable to; the value is still a
    // function, and still leaves here untouched, as it always has.
    return value as Flattened;
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    const constructorName = value.constructor?.name;
    const kind =
      constructorName !== undefined && constructorName !== "Object"
        ? constructorName
        : "collection";
    throw new TypeError(
      `toPlain: cannot flatten a ${kind}; convert it to an array or plain object first`,
    );
  }
  const out: Record<string, Flattened> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = toPlain(entry);
  return out;
};
