import { expect, test } from "@playwright/test";

import { alice, signInAsAdmin } from "./helpers/auth";
import { countRows, reset } from "./helpers/db";
import { gotoReady } from "./helpers/nav";

test.describe("API keys", () => {
  test.beforeAll(() => {
    reset();
  });

  test("create shows the secret once, the key authenticates, revoke makes it 401", async ({
    page,
  }) => {
    await signInAsAdmin(page, alice);
    await gotoReady(page, "/settings");
    const section = page.getByTestId("api-keys");
    await expect(section.getByText("No API keys created yet.")).toBeVisible();

    await section.getByRole("button", { name: "Create New Key" }).click();
    const form = page.getByTestId("create-api-key-form");
    await form.getByLabel("Key Name").fill("CI deploy key");
    await form.getByRole("checkbox", { name: "write" }).check();
    await form.getByRole("button", { name: "Create Key" }).click();

    const reveal = page.getByTestId("api-key-secret");
    await expect(reveal).toBeVisible();
    const masked = await page.getByTestId("api-key-plaintext").textContent();
    expect(masked).toMatch(/^gmk_.*•+$/);
    await reveal.getByRole("button", { name: "Reveal" }).click();
    const secret =
      (await page.getByTestId("api-key-plaintext").textContent()) ?? "";
    expect(secret).toMatch(/^gmk_[A-Za-z0-9_-]+$/);
    expect(secret).not.toContain("•");

    const row = page.getByTestId("api-key-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("CI deploy key");
    await expect(row).toContainText("Permissions: read, write");

    // The key works as a bearer credential, without the browser's cookies.
    const authed = await page.request.get("/api/auth/secret", {
      headers: { authorization: `Bearer ${secret}`, cookie: "" },
    });
    expect(authed.status()).toBe(200);
    const created = await page.request.post("/api/posts", {
      data: { title: "From a key", content: "written with the write scope" },
      headers: { authorization: `Bearer ${secret}`, cookie: "" },
    });
    expect(created.status()).toBe(201);

    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("API key revoked.")).toBeVisible();
    await expect(page.getByTestId("api-key-row")).toHaveCount(0);
    // Revocation is a timestamp, not a delete: the row stays for the audit trail.
    expect(countRows("api_keys", "revoked_at is null")).toBe(0);
    expect(countRows("api_keys")).toBe(1);

    const revoked = await page.request.get("/api/auth/secret", {
      headers: { authorization: `Bearer ${secret}`, cookie: "" },
    });
    expect(revoked.status()).toBe(401);
  });

  test("the form validates before anything is sent", async ({ page }) => {
    await signInAsAdmin(page, alice);
    await gotoReady(page, "/settings");
    await page
      .getByTestId("api-keys")
      .getByRole("button", { name: "Create New Key" })
      .click();
    const form = page.getByTestId("create-api-key-form");
    await form.getByRole("checkbox", { name: "read" }).uncheck();
    await form.getByRole("button", { name: "Create Key" }).click();
    await expect(form.getByRole("alert").first()).toBeVisible();
    await expect(page.getByTestId("api-key-secret")).toHaveCount(0);
  });
});
