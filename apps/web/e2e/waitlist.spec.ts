import { expect, test } from "@playwright/test";

import { alice, signIn, signInAsAdmin } from "./helpers/auth";
import { countRows, reset, setMaintenanceMode } from "./helpers/db";
import { gotoReady } from "./helpers/nav";

const requester = "founder@example.com";

test.describe("Waitlist", () => {
  test.beforeAll(async ({ browser }) => {
    reset();
    const admin = await browser.newContext();
    await signInAsAdmin(await admin.newPage(), alice);
    await admin.close();
    setMaintenanceMode(true);
  });

  test.afterAll(() => {
    setMaintenanceMode(false);
  });

  test("a visitor joins from the maintenance landing and the admin approves it", async ({
    browser,
    page,
  }) => {
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "We are in maintenance mode",
    );
    await expect(page.getByTestId("launch-banner")).toContainText(
      "Maintenance mode",
    );
    const form = page.getByTestId("waitlist-form");
    await form.getByLabel("Email").fill(requester);
    await form.getByLabel("Message").fill("Building an internal tool.");
    await form.getByRole("button", { name: "Join waitlist" }).click();
    await expect(page.getByText(/Thanks! You're on the list/)).toBeVisible();
    expect(countRows("waitlist_entry", `email = '${requester}'`)).toBe(1);

    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await signIn(adminPage, alice);
    await gotoReady(adminPage, "/admin");
    const entry = adminPage.locator(`[data-waitlist-email="${requester}"]`);
    await expect(entry).toHaveAttribute("data-waitlist-status", "pending");
    await expect(entry).toContainText("Building an internal tool.");
    await expect(adminPage.getByTestId("launch-controls")).toContainText(
      "1 waitlist entry",
    );
    await entry.getByRole("button", { name: "Approve" }).click();
    await expect(
      adminPage.getByText(`${requester} marked approved.`),
    ).toBeVisible();
    await expect(entry).toHaveAttribute("data-waitlist-status", "approved");
    await admin.close();
  });

  test("the contact form writes into the same queue", async ({ page }) => {
    await gotoReady(page, "/contact");
    const form = page.getByTestId("waitlist-form");
    await form.getByLabel("Email").fill("support@example.com");
    await form.getByLabel("Message").fill("Where are the docs?");
    await form.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(/Thanks! You're on the list/)).toBeVisible();
    expect(countRows("waitlist_entry", "source = 'contact'")).toBe(1);
  });

  test("an invalid email never reaches the server", async ({ page }) => {
    await gotoReady(page, "/contact");
    const form = page.getByTestId("waitlist-form");
    await form.getByLabel("Email").fill("not-an-email");
    await form.getByRole("button", { name: "Send message" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    expect(countRows("waitlist_entry", "email = 'not-an-email'")).toBe(0);
  });
});
