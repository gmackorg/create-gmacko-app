/**
 * The query layer is derived from the contract and must stay complete: every
 * endpoint has exactly one factory (a query for GET, a mutation otherwise),
 * and every key a mutation invalidates is a key some query produces, so a
 * typo in the invalidation map cannot silently leave a screen stale.
 */
import { AppApi } from "@gmacko/domain";
import { HttpApi } from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";

import type { ApiClient } from "../index";
import {
  CLEAR_ALL,
  invalidation,
  makeMutations,
  makeQueries,
  queryKeys,
} from "../queries";

/** `group.endpoint` for every endpoint of the contract, by method. */
const endpoints = (() => {
  const reads: Array<string> = [];
  const writes: Array<string> = [];
  HttpApi.reflect(AppApi, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint }) => {
      const id = `${group.identifier}.${endpoint.identifier}`;
      (endpoint.method === "GET" ? reads : writes).push(id);
    },
  });
  return { reads, writes };
})();

/** A client that never runs: the factories only need it as a value. */
const never = {
  run: () => Promise.reject(new Error("not called")),
} as unknown as ApiClient;

const sampleArgs: Record<string, ReadonlyArray<unknown>> = {
  "posts.byId": ["post_1"],
  "admin.getUser": ["user_1"],
  "admin.listUsers": [{ limit: 10, offset: 0 }],
};

/** Every key the registry can produce, by `group.endpoint`, plus each group's `all`. */
const registeredKeys = (): Map<string, ReadonlyArray<unknown>> => {
  const keys = new Map<string, ReadonlyArray<unknown>>();
  for (const [group, entries] of Object.entries(queryKeys)) {
    for (const [name, key] of Object.entries(entries)) {
      const value =
        typeof key === "function"
          ? key(...(sampleArgs[`${group}.${name}`] ?? []))
          : key;
      keys.set(`${group}.${name}`, value);
    }
  }
  return keys;
};

const sameKey = (a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>) =>
  JSON.stringify(a) === JSON.stringify(b);

describe("query keys", () => {
  it("has one key per GET endpoint, each nested under its group's `all`", () => {
    const keys = registeredKeys();
    for (const id of endpoints.reads) {
      const [group] = id.split(".");
      const key = keys.get(id);
      expect(key, `queryKeys.${id}`).toBeDefined();
      const all = keys.get(`${group}.all`);
      expect(all, `queryKeys.${group}.all`).toBeDefined();
      expect(key?.slice(0, all?.length)).toEqual(all);
    }
  });

  it("produces distinct keys: no two endpoints share one", () => {
    const seen = new Map<string, string>();
    for (const [id, key] of registeredKeys()) {
      if (id.endsWith(".all")) continue;
      const serialized = JSON.stringify(key);
      expect(seen.get(serialized), `${id} collides`).toBeUndefined();
      seen.set(serialized, id);
    }
  });
});

describe("query factories", () => {
  it("has a queryOptions factory for every GET endpoint and nothing else", () => {
    const queries = makeQueries(never);
    const ids = Object.entries(queries).flatMap(([group, entries]) =>
      Object.keys(entries).map((name) => `${group}.${name}`),
    );
    expect(ids.sort()).toEqual([...endpoints.reads].sort());
    for (const id of endpoints.reads) {
      const [group, name] = id.split(".") as [string, string];
      const factory = (queries as Record<string, Record<string, unknown>>)[
        group
      ]?.[name] as (...args: ReadonlyArray<unknown>) => {
        queryKey: ReadonlyArray<unknown>;
        queryFn: unknown;
      };
      const options = factory(...(sampleArgs[id] ?? []));
      expect(options.queryKey, id).toEqual(registeredKeys().get(id));
      expect(typeof options.queryFn, id).toBe("function");
    }
  });

  it("has a mutationOptions factory for every non-GET endpoint and nothing else", () => {
    const mutations = makeMutations(never);
    const ids = Object.entries(mutations).flatMap(([group, entries]) =>
      Object.keys(entries).map((name) => `${group}.${name}`),
    );
    expect(ids.sort()).toEqual([...endpoints.writes].sort());
  });
});

describe("invalidation map", () => {
  it("names every mutation exactly once", () => {
    expect(Object.keys(invalidation).sort()).toEqual(
      [...endpoints.writes].sort(),
    );
  });

  it("only invalidates keys the registry produces (or clears everything)", () => {
    const keys = [...registeredKeys().values()];
    for (const [id, targets] of Object.entries(invalidation)) {
      expect(targets.length, `${id} invalidates nothing`).toBeGreaterThan(0);
      for (const target of targets) {
        if (target === CLEAR_ALL) continue;
        expect(
          keys.some((key) => sameKey(key, target)),
          `${id} invalidates an unregistered key ${JSON.stringify(target)}`,
        ).toBe(true);
      }
    }
  });

  it("is carried on each mutation's meta, so a cache can apply it", () => {
    const mutations = makeMutations(never);
    for (const [id, targets] of Object.entries(invalidation)) {
      const [group, name] = id.split(".") as [string, string];
      const factory = (mutations as Record<string, Record<string, unknown>>)[
        group
      ]?.[name] as () => { meta?: { invalidates?: unknown } };
      expect(factory().meta?.invalidates, id).toEqual(targets);
    }
  });

  it("covers the reviewer's map", () => {
    const k = queryKeys;
    expect(invalidation["posts.create"]).toEqual([k.posts.list()]);
    expect(invalidation["posts.remove"]).toEqual([k.posts.list()]);
    expect(invalidation["settings.updatePreferences"]).toEqual([
      k.settings.getPreferences(),
    ]);
    expect(invalidation["settings.createInvite"]).toEqual([
      k.settings.listInvites(),
      k.settings.workspaceContext(),
      k.settings.billingOverview(),
    ]);
    expect(invalidation["settings.acceptInvite"]).toEqual(
      invalidation["settings.createInvite"],
    );
    expect(invalidation["settings.createApiKey"]).toEqual([
      k.settings.listApiKeys(),
    ]);
    expect(invalidation["settings.revokeApiKey"]).toEqual([
      k.settings.listApiKeys(),
    ]);
    expect(invalidation["settings.deleteAccount"]).toEqual([CLEAR_ALL]);
    expect(invalidation["admin.reviewWaitlistEntry"]).toEqual([
      k.admin.listWaitlistEntries(),
      k.admin.launchControls(),
      k.settings.listInvites(),
    ]);
    expect(invalidation["admin.completeBootstrap"]).toEqual([
      k.admin.bootstrapStatus(),
      k.settings.workspaceContext(),
      k.auth.session(),
      k.admin.all,
    ]);
    expect(invalidation["admin.updateLaunchControls"]).toEqual([
      k.settings.launchState(),
      k.admin.launchControls(),
    ]);
    // `users` is the prefix of every list page and every detail, so one
    // key covers the pages the changed row may appear on.
    expect(invalidation["admin.updateUserRole"]).toEqual([
      k.admin.users,
      k.auth.session(),
    ]);
    expect(k.admin.listUsers().slice(0, k.admin.users.length)).toEqual(
      k.admin.users,
    );
    expect(k.admin.getUser("user_1").slice(0, k.admin.users.length)).toEqual(
      k.admin.users,
    );
  });
});
