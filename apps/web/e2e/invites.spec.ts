import { expect, test } from "@playwright/test";

import { alice, api, bob, signIn, signInAsAdmin } from "./helpers/auth";
import { countRows, inviteIdFor, reset } from "./helpers/db";
import { gotoReady } from "./helpers/nav";

test.describe("Invites", () => {
  test.beforeAll(() => {
    reset();
  });

  test("the owner invites a teammate, who accepts and sees the workspace", async ({
    browser,
    page,
  }) => {
    await signInAsAdmin(page, alice);
    await gotoReady(page, "/settings");
    await expect(page.getByTestId("workspace")).toContainText(
      "your role: owner",
    );
    const form = page.getByTestId("invite-form");
    await form.getByLabel("Email").fill(bob.email);
    await form.getByLabel("Role").selectOption("member");
    await form.getByRole("button", { name: "Send Invite" }).click();
    await expect(
      page.getByText(`Invite created for ${bob.email}.`),
    ).toBeVisible();
    await expect(page.getByTestId("invite-list")).toContainText(bob.email);

    // Inviting the same address again is a typed Conflict, worded for people.
    await form.getByLabel("Email").fill(bob.email);
    await form.getByRole("button", { name: "Send Invite" }).click();
    await expect(
      page.getByText("That email already has a pending invite."),
    ).toBeVisible();

    const teammate = await browser.newContext();
    const teammatePage = await teammate.newPage();
    await signIn(teammatePage, bob);
    const accepted = await api(teammatePage).post(
      `/api/workspace/invites/${inviteIdFor(bob.email)}/accept`,
      {},
    );
    expect(accepted.status(), await accepted.text()).toBe(200);
    expect(await accepted.json()).toMatchObject({ role: "member" });

    await gotoReady(teammatePage, "/settings");
    await expect(teammatePage.getByTestId("workspace")).toContainText(
      "E2E Workspace",
    );
    await expect(teammatePage.getByTestId("workspace")).toContainText(
      "your role: member",
    );
    await expect(teammatePage.getByTestId("invite-form")).toHaveCount(0);
    await teammate.close();

    expect(countRows("workspace_membership")).toBe(2);
    await page.reload();
    await expect(page.getByTestId("invite-list")).toHaveCount(0);
    await expect(page.getByText("No pending invites yet.")).toBeVisible();
  });
});
