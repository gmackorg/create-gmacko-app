/**
 * The query string as TanStack Router hands it to a route's `validateSearch`.
 *
 * The default `parseSearch` decodes each `key=value` pair and then tries
 * `JSON.parse` on it (router-core `parseSearchWith`), falling back to the
 * decoded string, so a value is any JSON value — or `undefined` for a key the
 * URL does not carry. Naming that shape keeps every `validateSearch` in the
 * app a parse from one declared type into the route's own search type.
 */
export type SearchValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<SearchValue>
  | { readonly [key: string]: SearchValue };

/** One route's whole query string, before that route narrows it. */
export type RawSearch = Record<string, SearchValue>;
