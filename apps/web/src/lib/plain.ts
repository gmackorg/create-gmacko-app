/**
 * Query data crosses from the server render to the browser through TanStack
 * Start's serializer (seroval), which refuses class instances. The contract
 * decodes responses into `Schema.Class` instances (`Post`, `LaunchState`,
 * ...), so the QueryClient's `dehydrate.serializeData` flattens them to the
 * structurally identical plain object first. Dates stay Dates (seroval
 * carries them natively); arrays and nested objects are walked.
 */
export const toPlain = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = toPlain(entry);
  return out;
};
