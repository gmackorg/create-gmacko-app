import { expect, test } from "@playwright/test";

import { alice, api, signInAsAdmin } from "./helpers/auth";
import { countRows, reset, userByEmail } from "./helpers/db";
import { gotoReady } from "./helpers/nav";

test.describe("Delete account", () => {
  test.beforeAll(() => {
    reset();
  });

  test("removes the user and everything cascading from it, and kills the session", async ({
    page,
  }) => {
    await signInAsAdmin(page, alice);
    const key = await api(page).post("/api/api-keys", {
      name: "doomed",
      permissions: ["read"],
    });
    expect(key.status()).toBe(201);
    const user = userByEmail(alice.email);
    expect(user).toBeDefined();
    expect(countRows("session", `user_id = '${user?.id}'`)).toBeGreaterThan(0);
    expect(countRows("api_keys", `user_id = '${user?.id}'`)).toBe(1);
    expect(countRows("workspace", `owner_user_id = '${user?.id}'`)).toBe(1);

    await gotoReady(page, "/settings");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete my account" }).click();

    await expect(
      page.getByText("Your account has been deleted."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("button", { name: /sign in with github/i }),
    ).toBeVisible();

    // The response expired the cookies: the browser is anonymous now.
    const session = await page.request.get("/api/auth/session");
    expect(await session.json()).toEqual({ user: null, credential: null });
    const gated = await page.request.get("/api/preferences");
    expect(gated.status()).toBe(401);

    expect(userByEmail(alice.email)).toBeUndefined();
    expect(countRows("session", `user_id = '${user?.id}'`)).toBe(0);
    expect(countRows("api_keys", `user_id = '${user?.id}'`)).toBe(0);
    expect(countRows("workspace_membership", `user_id = '${user?.id}'`)).toBe(
      0,
    );
    expect(countRows("workspace", `owner_user_id = '${user?.id}'`)).toBe(0);
  });
});
