import { expect, test } from "@playwright/test";

import { alice, bob, signInAsAdmin } from "./helpers/auth";
import { magicLinkToken, reset } from "./helpers/db";
import { GITHUB_USER } from "./helpers/env";
import { gotoReady } from "./helpers/nav";

test.describe("Sign in", () => {
  test.beforeAll(async ({ browser }) => {
    reset();
    const admin = await browser.newContext();
    await signInAsAdmin(await admin.newPage(), alice);
    await admin.close();
  });

  test("magic link (bypass): the form sends a link and following it signs in", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    const form = page.getByTestId("magic-link-form");
    await form.getByRole("textbox", { name: "Email" }).fill(bob.email);
    await form.getByRole("button", { name: /continue with email/i }).click();
    await expect(page.getByTestId("magic-link-sent")).toBeVisible();

    // BYPASS_MAGIC_LINK prints the link instead of emailing it; the token it
    // carries is the verification row better-auth wrote.
    const token = magicLinkToken(bob.email);
    await gotoReady(
      page,
      `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=%2F`,
    );
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("signed-in-as")).toContainText(
      "Logged in as",
    );

    await gotoReady(page, "/settings");
    await expect(page.getByTestId("settings-user")).toContainText(bob.email);
  });

  test("GitHub through the emulated provider lands on the app signed in", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await page.getByRole("button", { name: /sign in with github/i }).click();
    // emulate's authorize page lists its users; pick the seeded one.
    await expect(page).toHaveURL(/\/login\/oauth\/authorize/);
    await page
      .locator(
        `form.user-form:has(input[name=login][value=${GITHUB_USER.login}]) button[type=submit]`,
      )
      .click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("signed-in-as")).toContainText(
      `Logged in as ${GITHUB_USER.name}`,
    );
    await gotoReady(page, "/settings");
    await expect(page.getByTestId("settings-user")).toContainText(
      GITHUB_USER.email,
    );
  });

  test("sign out returns to the anonymous home", async ({ page }) => {
    await gotoReady(page, "/");
    await page.getByRole("button", { name: /sign in with github/i }).click();
    await page
      .locator(
        `form.user-form:has(input[name=login][value=${GITHUB_USER.login}]) button[type=submit]`,
      )
      .click();
    await expect(page.getByTestId("signed-in-as")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("button", { name: /sign in with github/i }),
    ).toBeVisible();
    const session = await page.request.get("/api/auth/session");
    expect(await session.json()).toEqual({ user: null, credential: null });
  });
});
