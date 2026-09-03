/**
 * The `QueryClient` defaults: `shouldRetry` retries only what a retry can
 * fix (no response, an undeclared 5xx) and never a contract error or a
 * 4xx; `listUsers` keys one page one way; `applyInvalidation` removes a
 * deleted resource's entry and, on `CLEAR_ALL`, drops every query without
 * touching the mutation cache.
 */
import { Conflict, Forbidden, NotFound, Unauthorized } from "@gmacko/domain";
import { MutationCache, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { type ApiClient, ApiClientError } from "../index";
import {
  applyInvalidation,
  CLEAR_ALL,
  invalidates,
  LIST_USERS_DEFAULTS,
  listUsersQuery,
  MAX_RETRIES,
  makeQueries,
  makeQueryClient,
  queryKeys,
  shouldRetry,
} from "../queries";

const clientError = (
  kind: ApiClientError["kind"],
  status?: number,
): ApiClientError => new ApiClientError({ kind, message: kind, status });

describe("shouldRetry", () => {
  it("never retries a domain error: the answer will not change", () => {
    for (const error of [
      new NotFound({ resource: "post", id: "p1" }),
      new Unauthorized(),
      new Forbidden({ reason: "role" }),
      new Conflict({ reason: "invite-exists" }),
    ]) {
      expect(shouldRetry(0, error), error._tag).toBe(false);
    }
  });

  it("never retries an undeclared 4xx, a decode/encode problem, a defect or an interruption", () => {
    expect(shouldRetry(0, clientError("status", 400))).toBe(false);
    expect(shouldRetry(0, clientError("status", 404))).toBe(false);
    expect(shouldRetry(0, clientError("status", 499))).toBe(false);
    expect(shouldRetry(0, clientError("decode", 200))).toBe(false);
    expect(shouldRetry(0, clientError("encode"))).toBe(false);
    expect(shouldRetry(0, clientError("defect"))).toBe(false);
    expect(shouldRetry(0, clientError("interrupted"))).toBe(false);
  });

  it(`retries a transport failure and an undeclared 5xx, ${MAX_RETRIES} times`, () => {
    for (const error of [
      clientError("transport"),
      clientError("status", 500),
      clientError("status", 502),
      clientError("status", 503),
    ]) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        expect(
          shouldRetry(attempt, error),
          `${error.kind} ${error.status}`,
        ).toBe(true);
      }
      expect(shouldRetry(MAX_RETRIES, error)).toBe(false);
    }
  });

  it("keeps TanStack's default for errors the client did not produce", () => {
    expect(shouldRetry(0, new Error("boom"))).toBe(true);
    expect(shouldRetry(MAX_RETRIES, new Error("boom"))).toBe(false);
  });
});

describe("makeQueryClient", () => {
  const fetchFailing = async (
    error: unknown,
    overrides: Parameters<typeof makeQueryClient>[0] = {},
  ): Promise<{ calls: number; thrown: unknown }> => {
    let calls = 0;
    const queryClient = makeQueryClient({
      ...overrides,
      defaultOptions: {
        ...overrides.defaultOptions,
        queries: { retryDelay: 0, ...overrides.defaultOptions?.queries },
      },
    });
    const thrown = await queryClient
      .fetchQuery({
        queryKey: ["t", String(calls)],
        queryFn: () => {
          calls += 1;
          return Promise.reject(error);
        },
      })
      .catch((e: unknown) => e);
    queryClient.clear();
    return { calls, thrown };
  };

  it("does not retry a NotFound or a 404: one call, the typed error", async () => {
    const notFound = new NotFound({ resource: "post", id: "p1" });
    expect(await fetchFailing(notFound)).toEqual({
      calls: 1,
      thrown: notFound,
    });
    const status = clientError("status", 404);
    expect(await fetchFailing(status)).toEqual({ calls: 1, thrown: status });
  });

  it(`retries a transport failure ${MAX_RETRIES} times before giving up`, async () => {
    const transport = clientError("transport");
    expect(await fetchFailing(transport)).toEqual({
      calls: 1 + MAX_RETRIES,
      thrown: transport,
    });
  });

  it("lets the app's own defaults win", async () => {
    const transport = clientError("transport");
    expect(
      await fetchFailing(transport, {
        defaultOptions: { queries: { retry: false } },
      }),
    ).toEqual({ calls: 1, thrown: transport });
  });
});

describe("listUsers keys", () => {
  it("keys the default page one way, however it is spelled", () => {
    const k = queryKeys.admin;
    expect(k.listUsers()).toEqual(k.listUsers({}));
    expect(k.listUsers()).toEqual(k.listUsers({ limit: 20, offset: 0 }));
    expect(k.listUsers()).toEqual(k.listUsers({ offset: 0 }));
    expect(k.listUsers()).toEqual([...k.users, "list", LIST_USERS_DEFAULTS]);
    expect(k.listUsers({ offset: 20 })).not.toEqual(k.listUsers());
    expect(listUsersQuery({ limit: 5 })).toEqual({ limit: 5, offset: 0 });
  });

  it("requests the normalised page and keeps the previous page while loading", async () => {
    const seen: Array<unknown> = [];
    const api = {
      run: (f: (c: unknown) => unknown) =>
        Promise.resolve(
          f({
            admin: {
              listUsers: (input: unknown) => {
                seen.push(input);
                return { users: [], total: 0 };
              },
            },
          }),
        ),
    } as unknown as ApiClient;
    const queries = makeQueries(api);
    const options = queries.admin.listUsers({});
    expect(options.queryKey).toEqual(queryKeys.admin.listUsers());
    expect(options.placeholderData).toBeTypeOf("function");
    await options.queryFn?.({} as never);
    expect(seen).toEqual([{ query: { limit: 20, offset: 0 } }]);
  });
});

describe("applyInvalidation", () => {
  it("removes the deleted post's own entry and invalidates the list", async () => {
    const queryClient = new QueryClient();
    const byId = queryKeys.posts.byId("p1");
    const other = queryKeys.posts.byId("p2");
    const list = queryKeys.posts.list();
    queryClient.setQueryData(byId, { id: "p1" });
    queryClient.setQueryData(other, { id: "p2" });
    queryClient.setQueryData(list, [{ id: "p1" }, { id: "p2" }]);

    await applyInvalidation(queryClient, invalidates("posts.remove"), "p1");

    expect(queryClient.getQueryData(byId)).toBeUndefined();
    expect(queryClient.getQueryData(other)).toEqual({ id: "p2" });
    expect(queryClient.getQueryState(list)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
  });

  it("CLEAR_ALL removes every query but leaves the mutation cache alone", async () => {
    const mutationCache = new MutationCache();
    const queryClient = new QueryClient({ mutationCache });
    queryClient.setQueryData(queryKeys.auth.session(), { user: null });
    queryClient.setQueryData(queryKeys.posts.list(), []);
    const mutation = mutationCache.build(queryClient, {
      mutationKey: ["deleteAccount"],
      mutationFn: () => Promise.resolve(undefined),
    });

    await applyInvalidation(queryClient, { invalidates: [CLEAR_ALL] });

    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(mutationCache.getAll()).toContain(mutation);
  });

  it("is a no-op for meta it does not recognise", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.posts.list(), []);
    await applyInvalidation(queryClient, undefined);
    await applyInvalidation(queryClient, { other: true });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });
});
