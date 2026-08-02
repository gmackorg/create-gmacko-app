import { expect, test } from "@playwright/test";

test.describe("Home Page", () => {
  test("should display the main heading", async ({ page }) => {
    await page.goto("/");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
  });

  test("should have theme toggle button", async ({ page }) => {
    await page.goto("/");

    const themeToggle = page.getByRole("button", { name: /toggle theme/i });
    await expect(themeToggle).toBeVisible();
  });

  test("should show sign in button when not authenticated", async ({
    page,
  }) => {
    await page.goto("/");

    // The scaffold ships GitHub/Google/Apple social sign-in (see auth-showcase),
    // not Discord. Assert at least one real provider button is present.
    const signInButton = page.getByRole("button", {
      name: /sign in with (github|google|apple)/i,
    });
    await expect(signInButton.first()).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("gates the settings page behind authentication", async ({ page }) => {
    await page.goto("/settings");

    // An unauthenticated visit must not expose settings management — the app
    // sends the user to the sign-in / first-run setup flow. Assert a sign-in
    // affordance is shown (robust to the exact redirect target).
    await expect(
      page
        .getByRole("button", { name: /sign in with (github|google|apple)/i })
        .first(),
    ).toBeVisible();
  });
});

test.describe("Accessibility", () => {
  test("should not have any automatically detectable accessibility issues on home page", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for the page to actually render (first-run SSR runs several DB/tRPC
    // queries and can be slow to first paint) before asserting the landmark.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Basic accessibility checks
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Check that all images have alt text
    const images = page.locator("img");
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute("alt");
      expect(alt).not.toBeNull();
    }
  });
});
