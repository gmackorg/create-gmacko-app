import { expect, type Page, test } from "@playwright/test";

import { alice, api, signInAsAdmin } from "./helpers/auth";
import { reset } from "./helpers/db";
import { hydrated } from "./helpers/nav";

/** Every `/api/*` request the page itself makes (not the test's own `page.request` calls). */
const watchApi = (page: Page): Array<string> => {
  const seen: Array<string> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/"))
      seen.push(`${request.method()} ${url.pathname}`);
  });
  return seen;
};

test.describe("Server rendering", () => {
  test.beforeAll(() => {
    reset();
  });

  test("signed-in home renders its data on the server and makes no API calls after hydration", async ({
    page,
  }) => {
    await signInAsAdmin(page, alice);
    const created = await api(page).post("/api/posts", {
      title: "Rendered on the server",
      content: "no client refetch",
    });
    expect(created.status()).toBe(201);

    const seen = watchApi(page);
    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";
    expect(html).toContain("Rendered on the server");
    // React separates adjacent text nodes with a comment marker.
    expect(html).toMatch(new RegExp(`Logged in as (<!-- -->)?${alice.name}`));

    await hydrated(page);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("post-card")).toHaveCount(1);
    await page.waitForTimeout(500);
    expect(seen).toEqual([]);
  });

  test("settings renders every section on the server and makes no API calls after hydration", async ({
    page,
  }) => {
    await signInAsAdmin(page, alice);
    const seen = watchApi(page);
    const response = await page.goto("/settings");
    const html = (await response?.text()) ?? "";
    expect(html).toContain(alice.email);
    expect(html).toContain("No API keys created yet.");
    expect(html).toContain("your role: owner");

    await hydrated(page);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("preferences")).toBeVisible();
    await page.waitForTimeout(500);
    expect(seen).toEqual([]);
  });
});
