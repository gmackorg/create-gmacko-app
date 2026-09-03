import { expect, test } from "@playwright/test";

import { alice, signInAsAdmin } from "./helpers/auth";
import { reset } from "./helpers/db";
import { gotoReady } from "./helpers/nav";

test.describe("Session expiry", () => {
  test.beforeAll(() => {
    reset();
  });

  test("a mutation after the cookie expires shows the sign-in toast and returns home", async ({
    context,
    page,
  }) => {
    await signInAsAdmin(page, alice);
    await gotoReady(page, "/settings");
    await expect(page.getByTestId("preferences")).toBeVisible();

    // The session goes away under the open form.
    await context.clearCookies();

    await page
      .getByRole("group", { name: "Theme" })
      .getByRole("button", { name: "Dark" })
      .click();

    await expect(page.getByText("Sign in to continue.")).toBeVisible();
    await expect(page).toHaveURL(/\/(\?signin=true)?$/);
    await expect(
      page.getByRole("button", { name: /sign in with github/i }),
    ).toBeVisible();
  });
});
