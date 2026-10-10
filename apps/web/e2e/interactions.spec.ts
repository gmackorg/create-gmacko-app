import { forgePosts } from "@gmacko/api-client";
import { expect, test } from "@playwright/test";

import { alice, signInAsAdmin } from "./helpers/auth";
import { reset } from "./helpers/db";
import { gotoReady } from "./helpers/nav";

test.describe("Interaction edges", () => {
  test.beforeEach(async ({ page }) => {
    reset();
    await signInAsAdmin(page, alice);
  });

  test("double-clicking Create yields one post", async ({ page }) => {
    await gotoReady(page, "/");
    const form = page.getByTestId("create-post-form");
    await form.getByLabel("Bug Title").fill("Only once");
    await form.getByLabel("Content").fill("two clicks, one post");
    await page.getByTestId("create-post").dblclick();

    await expect(page.getByTestId("post-card")).toHaveCount(1);
    await expect(page.getByTestId("post-card")).toContainText("Only once");
    await page.waitForTimeout(500);
    expect(await forgePosts.list()).toHaveLength(1);
  });

  test("leaving the page during a slow mutation raises no error and leaves no orphan toast", async ({
    page,
  }) => {
    const errors: Array<string> = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // Hold the browser's create so navigation happens while it is in flight.
    await page.route("http://127.0.0.1:8787/v1/posts", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });

    await gotoReady(page, "/");
    const form = page.getByTestId("create-post-form");
    await form.getByLabel("Bug Title").fill("Slow one");
    await form.getByLabel("Content").fill("created while navigating away");
    await page.getByTestId("create-post").click();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.waitForTimeout(3500);
    expect(errors).toEqual([]);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page.getByTestId("post-card")).toHaveCount(1);
    await expect(page.getByTestId("post-card")).toContainText("Slow one");
  });
});
