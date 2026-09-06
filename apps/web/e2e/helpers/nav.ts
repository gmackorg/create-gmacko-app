import type { Page } from "@playwright/test";

/**
 * `page.goto` that also waits for React to own the document (the root
 * route stamps `data-hydrated` on `<html>`), so a form filled right after
 * navigation submits through the app, never natively.
 */
export const gotoReady = async (page: Page, path: string): Promise<void> => {
  await page.goto(path);
  await hydrated(page);
};

export const hydrated = (page: Page): Promise<void> =>
  page.locator('html[data-hydrated="true"]').waitFor({ state: "attached" });
