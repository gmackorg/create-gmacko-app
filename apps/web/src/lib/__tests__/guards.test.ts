/**
 * The `beforeLoad` guards: `/settings` needs a user, `/admin*` an admin.
 * A refusal is a TanStack redirect (thrown), with the `?signin=1` hint only
 * for anonymous visitors.
 */
import { SessionState, User } from "@gmacko/domain";
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { requireAdmin, requireUser } from "../guards";

const user = (role: "user" | "admin") =>
  new User({
    id: "u1" as never,
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const anonymous = async () =>
  new SessionState({ user: null, credential: null });
const signedIn = (role: "user" | "admin") => async () =>
  new SessionState({ user: user(role), credential: "session" });

const redirectOf = async (run: () => Promise<unknown>) => {
  const thrown = await run().then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!isRedirect(thrown))
    throw new Error(`expected a redirect, got ${String(thrown)}`);
  return thrown.options;
};

describe("requireUser", () => {
  it("returns the user when signed in", async () => {
    await expect(requireUser(signedIn("user"))).resolves.toMatchObject({
      email: "ada@example.com",
    });
  });

  it("redirects anonymous visitors home with the sign-in hint", async () => {
    const options = await redirectOf(() => requireUser(anonymous));
    expect(options).toMatchObject({ to: "/", search: { signin: true } });
  });
});

describe("requireAdmin", () => {
  it("returns an admin", async () => {
    await expect(requireAdmin(signedIn("admin"))).resolves.toMatchObject({
      role: "admin",
    });
  });

  it("sends a signed-in non-admin home without a hint", async () => {
    const options = await redirectOf(() => requireAdmin(signedIn("user")));
    expect(options).toMatchObject({ to: "/" });
    expect(options.search).toBeUndefined();
  });

  it("sends anonymous visitors to sign in", async () => {
    const options = await redirectOf(() => requireAdmin(anonymous));
    expect(options).toMatchObject({ to: "/", search: { signin: true } });
  });
});
