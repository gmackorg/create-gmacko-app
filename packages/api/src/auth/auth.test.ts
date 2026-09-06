/**
 * `auth.session` answers "who am I" for either credential kind without ever
 * failing, and `auth.secret` is the template's smoke endpoint.
 */
import { Database } from "@gmacko/db";
import { user } from "@gmacko/db/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeTestApi, type TestApi } from "../testing";

let api: TestApi;
beforeAll(() => {
  api = makeTestApi();
});
afterAll(() => api.dispose());

describe("auth.session", () => {
  it("is anonymous without a credential: user null, credential null, 200", async () => {
    const state = await api.call((client) => client.auth.session());
    expect(state).toEqual({ user: null, credential: null });
    expect((await api.fetch("/api/auth/session")).status).toBe(200);
  });

  it("resolves a cookie session to the user row (role included) with credential 'session'", async () => {
    const person = await api.createUser({ name: "Taylor" });
    const state = await api.call((client) => client.auth.session(), {
      cookie: person.cookie,
    });
    expect(state.credential).toBe("session");
    expect(state.user).toMatchObject({
      id: person.id,
      email: person.email,
      name: "Taylor",
      role: "user",
      image: null,
    });
    expect(state.user?.createdAt).toBeInstanceOf(Date);
  });

  it("reads the role from the database, not the cookie cache", async () => {
    const person = await api.createUser();
    await api.run(
      Effect.flatMap(Database, ({ db }) =>
        db.update(user).set({ role: "admin" }).where(eq(user.id, person.id)),
      ),
    );
    const state = await api.call((client) => client.auth.session(), {
      cookie: person.cookie,
    });
    expect(state.user?.role).toBe("admin");
  });

  it("resolves a bearer key to its owner with credential 'key'", async () => {
    const owner = await api.createUser();
    const key = await api.createApiKey(owner, ["read"]);
    const state = await api.call((client) => client.auth.session(), {
      bearer: key.key,
    });
    expect(state.credential).toBe("key");
    expect(state.user?.id).toBe(owner.id);
  });

  it("treats an invalid bearer as anonymous, never as an error", async () => {
    const owner = await api.createUser();
    for (const bearer of ["gmk_unknown", "not-a-key"]) {
      const state = await api.call((client) => client.auth.session(), {
        bearer,
        cookie: owner.cookie,
      });
      expect(state).toEqual({ user: null, credential: null });
    }
  });
});

describe("auth.secret", () => {
  it("requires a credential and answers the message", async () => {
    const failure = await api.failure((client) => client.auth.secret());
    expect(failure).toMatchObject({ _tag: "Unauthorized" });

    const person = await api.createUser();
    expect(
      await api.call((client) => client.auth.secret(), {
        cookie: person.cookie,
      }),
    ).toBe("you can see this secret message!");

    const key = await api.createApiKey(person, ["read"]);
    expect(
      await api.call((client) => client.auth.secret(), { bearer: key.key }),
    ).toBe("you can see this secret message!");
  });
});
