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
export const toPlain = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (isUnsupported(value)) {
    throw new TypeError(
      `toPlain: cannot flatten a ${describe(value)}; convert it to an array or plain object first`,
    );
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = toPlain(entry);
  return out;
};

const isUnsupported = (value: object): boolean =>
  value instanceof Map ||
  value instanceof Set ||
  value instanceof WeakMap ||
  value instanceof WeakSet ||
  value instanceof ArrayBuffer ||
  ArrayBuffer.isView(value);

const describe = (value: object): string =>
  value.constructor?.name && value.constructor.name !== "Object"
    ? value.constructor.name
    : "collection";
