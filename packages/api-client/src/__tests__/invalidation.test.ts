/**
 * The query layer is derived from the contract and must stay complete: every
 * endpoint has exactly one factory (a query for GET, a mutation otherwise),
 * and every key a mutation invalidates is a key some query produces, so a
 * typo in the invalidation map cannot silently leave a screen stale.
 */
import { AppApi } from "@gmacko/domain";
import type { MutationMeta, QueryKey } from "@tanstack/react-query";
import { HttpApi } from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";

import { makeApiClient } from "../index";
import {
  CLEAR_ALL,
  invalidation,
  makeMutations,
  makeQueries,
  queryKeys,
  removal,
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

/** A client whose transport never answers: the factories only need it as a value. */
const never = makeApiClient({
  baseUrl: "http://localhost",
  transport: () => Promise.reject(new Error("not called")),
});

/**
 * The arguments the parameterised entries are walked with, per
 * `group.endpoint`: the id or page each one's own signature declares.
 */
const sampleArgs = new Map<string, ReadonlyArray<unknown>>([
  ["posts.byId", ["post_1"]],
  ["admin.getUser", ["user_1"]],
  ["admin.listUsers", [{ limit: 10, offset: 0 }]],
]);

/**
 * Calls one entry of a registry with its sample arguments. The walks below
 * see every factory through a single shape, so their differing parameter
 * lists collapse to `never` and the arguments have to be handed back.
 */
const withSample = <R>(
  factory: (...args: ReadonlyArray<never>) => R,
  id: string,
): R =>
  // SAFETY: `sampleArgs` holds, for each parameterised endpoint, exactly the
  // argument list that endpoint's own factory declares (`posts.byId(string)`,
  // `admin.getUser(string)`, `admin.listUsers(ListUsersInput)`); a wrong one
  // fails the `queryKey` comparisons below. Every other entry takes none.
  factory(...((sampleArgs.get(id) ?? []) as ReadonlyArray<never>));

/** A `queryKeys` entry: a key tuple, or the factory that builds one. */
type KeyEntry =
  | ReadonlyArray<unknown>
  | ((...args: ReadonlyArray<never>) => ReadonlyArray<unknown>);

/** Every key the registry can produce, by `group.endpoint`, plus each group's `all`. */
const registeredKeysOf = (
  groups: Readonly<Record<string, Readonly<Record<string, KeyEntry>>>>,
): Map<string, ReadonlyArray<unknown>> => {
  const keys = new Map<string, ReadonlyArray<unknown>>();
  for (const [group, entries] of Object.entries(groups)) {
    for (const [name, entry] of Object.entries(entries)) {
      const id = `${group}.${name}`;
      keys.set(id, entry instanceof Function ? withSample(entry, id) : entry);
    }
  }
  return keys;
};

const registeredKeys = (): Map<string, ReadonlyArray<unknown>> =>
  registeredKeysOf(queryKeys);

/** A `queryOptions` factory as the completeness walk calls it. */
type QueryFactory = (...args: ReadonlyArray<never>) => {
  readonly queryKey: QueryKey;
  readonly queryFn?: unknown;
};

/** A `mutationOptions` factory as the completeness walk calls it. */
type MutationFactory = (...args: ReadonlyArray<never>) => {
  readonly meta?: MutationMeta | undefined;
};

/** The factories of `makeQueries`/`makeMutations`, flattened to `group.endpoint`. */
const factoriesOf = <F>(
  groups: Readonly<Record<string, Readonly<Record<string, F>>>>,
): Map<string, F> => {
  const factories = new Map<string, F>();
  for (const [group, entries] of Object.entries(groups)) {
    for (const [name, factory] of Object.entries(entries)) {
      factories.set(`${group}.${name}`, factory);
    }
  }
  return factories;
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
    const factories = factoriesOf<QueryFactory>(makeQueries(never));
    expect([...factories.keys()].sort()).toEqual([...endpoints.reads].sort());
    for (const id of endpoints.reads) {
      const factory = factories.get(id);
      expect(factory, `queries.${id}`).toBeDefined();
      const options =
        factory === undefined ? undefined : withSample(factory, id);
      expect(options?.queryKey, id).toEqual(registeredKeys().get(id));
      expect(options?.queryFn, id).toBeTypeOf("function");
    }
  });

  it("has a mutationOptions factory for every non-GET endpoint and nothing else", () => {
    const factories = factoriesOf<MutationFactory>(makeMutations(never));
    expect([...factories.keys()].sort()).toEqual([...endpoints.writes].sort());
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
    const factories = factoriesOf<MutationFactory>(makeMutations(never));
    const removalById = new Map(Object.entries(removal));
    for (const [id, targets] of Object.entries(invalidation)) {
      const factory = factories.get(id);
      expect(factory, `mutations.${id}`).toBeDefined();
      const meta = factory?.().meta;
      expect(meta?.invalidates, id).toEqual(targets);
      expect(meta?.removes, id).toBe(removalById.get(id));
    }
  });

  it("covers the reviewer's map", () => {
    const k = queryKeys;
    expect(invalidation["posts.create"]).toEqual([k.posts.list()]);
    // Removing a post drops its own entry (a refetch would 404) and
    // stales the list.
    expect(invalidation["posts.remove"]).toEqual([k.posts.list()]);
    expect(removal["posts.remove"]?.("post_1")).toEqual([
      k.posts.byId("post_1"),
    ]);
    expect(Object.keys(removal)).toEqual(["posts.remove"]);
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
    // The waitlist count rides on the launch controls.
    expect(invalidation["settings.submitWaitlistEntry"]).toEqual([
      k.admin.listWaitlistEntries(),
      k.admin.launchControls(),
    ]);
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
    // key covers the pages the changed row may appear on; the stats count
    // users by role.
    expect(invalidation["admin.updateUserRole"]).toEqual([
      k.admin.users,
      k.admin.stats(),
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
