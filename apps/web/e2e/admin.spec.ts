import { expect, test } from "@playwright/test";

import { alice, bob, signIn } from "./helpers/auth";
import { reset, userByEmail } from "./helpers/db";
import { gotoReady } from "./helpers/nav";

test.describe("Admin", () => {
  test.beforeAll(() => {
    reset();
  });

  test("the first user completes bootstrap in the browser and becomes admin", async ({
    page,
  }) => {
    await signIn(page, alice);
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Finish the initial app bootstrap",
    );
    const form = page.getByTestId("bootstrap-form");
    await form.getByLabel("Workspace name").fill("Acme HQ");
    await form.getByRole("button", { name: "Complete setup" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByText("Setup complete. You are the platform admin."),
    ).toBeVisible();
    await expect(page.getByTestId("workspace")).toContainText("Acme HQ");
    expect(userByEmail(alice.email)?.role).toBe("admin");
  });

  test("a non-admin is sent home; the admin sees the dashboard", async ({
    browser,
    page,
  }) => {
    const member = await browser.newContext();
    const memberPage = await member.newPage();
    await signIn(memberPage, bob);
    await gotoReady(memberPage, "/admin");
    await expect(memberPage).toHaveURL(/\/$/);
    await expect(memberPage.getByTestId("signed-in-as")).toContainText(
      bob.name,
    );
    await member.close();

    await signIn(page, alice);
    await gotoReady(page, "/admin");
    await expect(
      page.getByRole("heading", { name: "Admin Dashboard" }),
    ).toBeVisible();
    const stats = page.getByTestId("admin-stats");
    await expect(stats.getByTestId("stats-card").first()).toContainText(
      "Total Users",
    );
    await expect(stats.getByTestId("stats-card").first()).toContainText("2");
    await expect(page.getByTestId("launch-controls")).toBeVisible();
    await expect(page.getByTestId("recent-users")).toContainText(bob.email);
    await expect(page.getByTestId("bootstrap-status")).toContainText(
      "Setup completed",
    );
  });

  test("launch controls save and the change is visible to anonymous visitors", async ({
    browser,
    page,
  }) => {
    await signIn(page, alice);
    await gotoReady(page, "/admin");
    const form = page.getByTestId("launch-controls-form");
    await form.getByLabel("Announcement").fill("Invites open next week.");
    await form.getByLabel("Tone").selectOption("warning");
    await form.getByRole("button", { name: "Save launch controls" }).click();
    await expect(page.getByText("Launch controls saved.")).toBeVisible();

    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    await gotoReady(visitorPage, "/");
    await expect(visitorPage.getByTestId("launch-banner")).toContainText(
      "Invites open next week.",
    );
    await visitor.close();

    await form.getByLabel("Announcement").fill("");
    await form.getByRole("button", { name: "Save launch controls" }).click();
    await expect(page.getByText("Launch controls saved.")).toBeVisible();
  });

  test("the users page paginates and changes roles, but never demotes yourself", async ({
    page,
  }) => {
    await signIn(page, alice);
    await gotoReady(page, "/admin/users");
    await expect(
      page.getByRole("heading", { name: "User Management" }),
    ).toBeVisible();
    await expect(page.getByTestId("user-row")).toHaveCount(2);
    await expect(page.getByTestId("users-range")).toHaveText(
      "Showing 1-2 of 2",
    );
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    const bobRow = page.locator(`[data-user-email="${bob.email}"]`);
    await bobRow
      .getByRole("combobox", { name: `Role for ${bob.email}` })
      .selectOption("admin");
    await bobRow.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByText(`${bob.email} is now admin.`)).toBeVisible();
    expect(userByEmail(bob.email)?.role).toBe("admin");

    const aliceRow = page.locator(`[data-user-email="${alice.email}"]`);
    await aliceRow
      .getByRole("combobox", { name: `Role for ${alice.email}` })
      .selectOption("user");
    await aliceRow.getByRole("button", { name: "Yes" }).click();
    await expect(
      page.getByText("You cannot remove your own admin role."),
    ).toBeVisible();
    expect(userByEmail(alice.email)?.role).toBe("admin");
  });
});
