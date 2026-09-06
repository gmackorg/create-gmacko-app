import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers/auth";
import { reset } from "./helpers/db";
import { gotoReady } from "./helpers/nav";

test.describe("Home page", () => {
  test.beforeAll(() => {
    reset();
  });

  test("asks for first-run setup on an empty database", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Finish the initial app bootstrap",
    );
    await expect(
      page.getByRole("button", { name: /sign in with github/i }),
    ).toBeVisible();
    await expect(page.getByTestId("magic-link-form")).toBeVisible();
  });

  test("has the theme toggle", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(
      page.getByRole("button", { name: /toggle theme/i }),
    ).toBeVisible();
  });

  test("shows the marketing shell with sign-in once set up", async ({
    browser,
    page,
  }) => {
    const admin = await browser.newContext();
    await signInAsAdmin(await admin.newPage());
    await admin.close();

    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Build, launch, and collect interest/,
    );
    await expect(
      page
        .getByRole("button", { name: /sign in with (github|google|apple)/i })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Marketing" }),
    ).toBeVisible();
    for (const [name, href] of [
      ["Pricing", "/pricing"],
      ["FAQ", "/faq"],
      ["Changelog", "/changelog"],
      ["Contact", "/contact"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ] as const) {
      await expect(
        page
          .getByRole("navigation", { name: "Marketing" })
          .getByRole("link", { name }),
      ).toHaveAttribute("href", href);
    }
  });

  test("gates the settings page behind authentication", async ({ page }) => {
    await gotoReady(page, "/settings");
    await expect(page).toHaveURL(/\/(\?signin=true)?$/);
    await expect(
      page
        .getByRole("button", { name: /sign in with (github|google|apple)/i })
        .first(),
    ).toBeVisible();
    await expect(page.getByText("Sign in to continue.")).toBeVisible();
  });

  test("has no images without alt text and a main landmark", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
    const images = page.locator("img");
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      expect(await images.nth(i).getAttribute("alt")).not.toBeNull();
    }
  });
});
