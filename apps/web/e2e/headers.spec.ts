import { expect, type Page, test } from "@playwright/test";

import { alice, signInAsAdmin } from "./helpers/auth";
import { reset } from "./helpers/db";
import { hydrated } from "./helpers/nav";

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/faq",
  "/contact",
  "/changelog",
  "/privacy",
  "/terms",
];
const SIGNED_IN_PATHS = ["/settings", "/admin", "/admin/users"];

/** Console lines the browser prints for a blocked resource or inline script. */
const cspViolation =
  /Content Security Policy|Refused to (load|execute|apply|connect)/i;

const assertSecureVisit = async (page: Page, path: string): Promise<void> => {
  const violations: Array<string> = [];
  const errors: Array<string> = [];
  page.on("console", (message) => {
    if (cspViolation.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto(path);
  expect(response, path).not.toBeNull();
  const headers = response?.headers() ?? {};
  expect(headers["x-frame-options"], path).toBe("DENY");
  expect(headers["referrer-policy"], path).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(headers["x-content-type-options"], path).toBe("nosniff");
  const csp = headers["content-security-policy"] ?? "";
  expect(csp, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp, path).toContain("frame-ancestors 'none'");
  expect(csp, path).toContain("object-src 'none'");
  // Development stage: no HSTS on plain http.
  expect(headers["strict-transport-security"], path).toBeUndefined();

  // The nonce in the policy is the one on the page's inline scripts.
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  const meta = await page
    .locator('meta[property="csp-nonce"]')
    .getAttribute("content");
  expect(meta, path).toBe(nonce);
  const inlineWithoutNonce = await page
    .locator("script:not([src])")
    .evaluateAll(
      // The locator is `script:not([src])`, so every element is a script.
      (scripts: HTMLScriptElement[], expected) =>
        // Browsers hide the `nonce` attribute once parsed; the IDL property
        // still carries it.
        scripts.filter((script) => script.nonce !== expected).length,
      nonce,
    );
  expect(inlineWithoutNonce, path).toBe(0);

  await hydrated(page);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).toBeVisible();
  expect(violations, path).toEqual([]);
  expect(errors, path).toEqual([]);
};

test.describe("Security headers", () => {
  test.beforeAll(() => {
    reset();
  });

  for (const path of PUBLIC_PATHS) {
    test(`public ${path} carries the headers and has no CSP violations`, async ({
      page,
    }) => {
      await assertSecureVisit(page, path);
    });
  }

  for (const path of SIGNED_IN_PATHS) {
    test(`signed-in ${path} carries the headers and has no CSP violations`, async ({
      page,
    }) => {
      await signInAsAdmin(page, alice);
      await assertSecureVisit(page, path);
    });
  }
});
