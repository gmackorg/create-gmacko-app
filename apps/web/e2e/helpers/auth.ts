/**
 * Sign-in for the suite, through the real magic-link flow: the app is
 * started with `BYPASS_MAGIC_LINK=true`, so the link is logged rather than
 * emailed, and its token is read back from the `verification` table. The
 * verify request runs on the page's request context, so the session
 * cookies it sets are the browser's.
 */
import { expect, type Page } from "@playwright/test";
import { magicLinkToken, setUserRole } from "./db";
import { BASE_URL, GITHUB_USER } from "./env";
import { hydrated } from "./nav";

export interface Person {
  readonly email: string;
  readonly name: string;
}

export const alice: Person = { email: "alice@example.com", name: "Alice" };
export const bob: Person = { email: "bob@example.com", name: "Bob" };

const origin = { origin: BASE_URL };

/** Requests and follows a magic link; the page is signed in afterwards. */
export const signIn = async (page: Page, person: Person): Promise<void> => {
  const requested = await page.request.post(
    `${BASE_URL}/api/auth/sign-in/magic-link`,
    {
      data: { email: person.email, name: person.name, callbackURL: "/" },
      headers: origin,
    },
  );
  expect(requested.ok(), await requested.text()).toBe(true);
  const token = magicLinkToken(person.email);
  const verified = await page.request.get(
    `${BASE_URL}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=%2F`,
    { maxRedirects: 0 },
  );
  expect(verified.status(), await verified.text()).toBe(302);
  const session = await page.request.get(`${BASE_URL}/api/auth/session`);
  // SAFETY: `GET /api/auth/session` is the contract's `auth.session`
  // endpoint, which answers a `SessionState`: `user` is the signed-in user
  // row (which always carries `email`) or null.
  const body = (await session.json()) as { user: { email: string } | null };
  expect(body.user?.email).toBe(person.email);
};

/**
 * The browser OAuth journey against the emulated GitHub: the page must
 * already be on the app and hydrated. It ends back on `/` as a brand new
 * document (the provider redirect is a full navigation), so it waits for
 * React to own that document again before returning; a click landing on
 * the server-rendered HTML before hydration does nothing at all.
 */
export const signInWithGitHub = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /sign in with github/i }).click();
  // emulate's authorize page lists its users; pick the seeded one.
  await expect(page).toHaveURL(/\/login\/oauth\/authorize/);
  await page
    .locator(
      `form.user-form:has(input[name=login][value=${GITHUB_USER.login}]) button[type=submit]`,
    )
    .click();
  await expect(page).toHaveURL(/\/$/);
  await hydrated(page);
};

/** First-run setup through the contract; the caller becomes the platform admin and owns the workspace. */
export const completeBootstrap = async (
  page: Page,
  workspaceName = "E2E Workspace",
): Promise<void> => {
  const response = await page.request.post(
    `${BASE_URL}/api/bootstrap/complete`,
    {
      data: { workspaceName },
      headers: origin,
    },
  );
  expect(response.status(), await response.text()).toBe(201);
};

/**
 * Signs `person` in as a platform admin: by finishing bootstrap (they then
 * own the workspace), or, when bootstrap already happened in this spec, by
 * promoting the row directly.
 */
export const signInAsAdmin = async (
  page: Page,
  person: Person = alice,
): Promise<void> => {
  await signIn(page, person);
  const response = await page.request.post(
    `${BASE_URL}/api/bootstrap/complete`,
    {
      data: { workspaceName: "E2E Workspace" },
      headers: origin,
    },
  );
  if (response.status() === 409) {
    setUserRole(person.email, "admin");
    return;
  }
  expect(response.status(), await response.text()).toBe(201);
};

/** A JSON request body, as Playwright serialises it onto the wire. */
export type JsonBody =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<JsonBody>
  | { readonly [key: string]: JsonBody };

/** A typed call through the page's cookies, with the origin the cookie rule needs on writes. */
export const api = (page: Page) => ({
  get: (path: string, headers: Record<string, string> = {}) =>
    page.request.get(`${BASE_URL}${path}`, { headers }),
  post: (path: string, data: JsonBody, headers: Record<string, string> = {}) =>
    page.request.post(`${BASE_URL}${path}`, {
      data,
      headers: { ...origin, ...headers },
    }),
  delete: (path: string, headers: Record<string, string> = {}) =>
    page.request.delete(`${BASE_URL}${path}`, {
      headers: { ...origin, ...headers },
    }),
});
