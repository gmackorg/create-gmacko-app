/**
 * The RFC 8628 device grant end to end, on the same in-process stack as
 * auth.test.ts: a signed-in browser (magic link) approves the code a "device"
 * asked for, the device redeems it for a session token, and the `bearer`
 * plugin accepts that token on every auth endpoint. Both pairing paths the
 * mobile app uses run through here (the QR path pre-approves before the
 * phone redeems; the user-code path redeems, polls, then gets approved).
 */
import type { Database } from "@gmacko/db";
import { layerTest } from "@gmacko/db/testing";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Auth } from "../service";

const baseUrl = "http://localhost:3001";
const clientId = "mobile-app";
const magicLinks: Array<{ email: string; url: string }> = [];

const AuthTest = Auth.layer({
  baseUrl,
  productionUrl: baseUrl,
  secret: "test-secret-that-is-long-enough-for-better-auth",
  allowedOrigins: [baseUrl],
  github: { clientId: "gh-client", clientSecret: "gh-secret" },
  google: { clientId: "google-client", clientSecret: "google-secret" },
  magicLink: {
    send: async (link) => {
      magicLinks.push(link);
    },
  },
  deviceClientIds: [clientId],
}).pipe(Layer.provide(layerTest));

interface DeviceCodeBody {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly verification_uri_complete: string;
  readonly expires_in: number;
  readonly interval: number;
}

/** `/device/token`: a session token, or the grant's OAuth-style error. */
interface DeviceTokenBody {
  readonly access_token?: string;
  readonly token_type?: string;
  readonly error?: string;
}

interface GetSessionBody {
  readonly user: { readonly email: string };
}

const jsonHeaders = {
  "content-type": "application/json",
  origin: baseUrl,
};

const sessionCookieOf = (response: Response): string => {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /(?:^|,\s*)([^=;,\s]*session_token)=([^;]+)/.exec(setCookie);
  if (!match) throw new Error(`no session cookie in: ${setCookie}`);
  return `${match[1]}=${match[2]}`;
};

describe("device authorization (sqlite-node)", () => {
  let runtime: ManagedRuntime.ManagedRuntime<Auth | Database, never>;
  const run = <A, E>(effect: Effect.Effect<A, E, Auth | Database>) =>
    runtime.runPromise(effect);

  beforeAll(() => {
    runtime = ManagedRuntime.make(Layer.provideMerge(AuthTest, layerTest));
  });
  afterAll(() => runtime.dispose());

  /** A browser session for a fresh user, through the magic-link round trip. */
  const signIn = (email: string) =>
    Effect.gen(function* () {
      const auth = yield* Auth;
      yield* auth.handler(
        new Request(`${baseUrl}/api/auth/sign-in/magic-link`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ email, callbackURL: "/" }),
        }),
      );
      const link = magicLinks.find((l) => l.email === email);
      if (!link) throw new Error("magic link was not sent");
      const verified = yield* auth.handler(
        new Request(link.url, { redirect: "manual" }),
      );
      return sessionCookieOf(verified);
    });

  const requestCode = (client: string) =>
    Effect.flatMap(Auth, (auth) =>
      auth.handler(
        new Request(`${baseUrl}/api/auth/device/code`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ client_id: client }),
        }),
      ),
    );

  const redeem = (deviceCode: string) =>
    Effect.flatMap(Auth, (auth) =>
      auth.handler(
        new Request(`${baseUrl}/api/auth/device/token`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceCode,
            client_id: clientId,
          }),
        }),
      ),
    );

  /**
   * `GET /device`: the signed-in browser claims the user code before it may
   * approve or deny it. Without this the grant refuses the decision with
   * `invalid_request` ("not been claimed by a verifying session").
   */
  const claim = (userCode: string, cookie: string) =>
    Effect.flatMap(Auth, (auth) =>
      auth.handler(
        new Request(
          `${baseUrl}/api/auth/device?user_code=${encodeURIComponent(userCode)}`,
          { headers: { origin: baseUrl, cookie } },
        ),
      ),
    );

  const decide = (
    action: "approve" | "deny",
    userCode: string,
    cookie: string,
  ) =>
    Effect.flatMap(Auth, (auth) =>
      auth.handler(
        new Request(`${baseUrl}/api/auth/device/${action}`, {
          method: "POST",
          headers: { ...jsonHeaders, cookie },
          body: JSON.stringify({ userCode }),
        }),
      ),
    );

  it("issues a code, waits for approval, then hands out a bearer session", async () => {
    const email = `device-${crypto.randomUUID()}@example.com`;
    const result = await run(
      Effect.gen(function* () {
        const auth = yield* Auth;
        const cookie = yield* signIn(email);

        const issued = yield* requestCode(clientId);
        const code = yield* Effect.promise(() => issued.json<DeviceCodeBody>());

        const claimed = yield* claim(code.user_code, cookie);
        const approved = yield* decide("approve", code.user_code, cookie);
        const redeemed = yield* redeem(code.device_code);
        const token = yield* Effect.promise(() =>
          redeemed.json<DeviceTokenBody>(),
        );

        // A device code is single-use: the second redemption is refused. The
        // grant also enforces its own polling interval, so wait it out first —
        // otherwise the refusal we would see is `slow_down`, not single-use.
        yield* Effect.sleep(`${code.interval + 1} seconds`);
        const again = yield* redeem(code.device_code);
        const againBody = yield* Effect.promise(() =>
          again.json<DeviceTokenBody>(),
        );

        const session = yield* auth.handler(
          new Request(`${baseUrl}/api/auth/get-session`, {
            headers: { authorization: `Bearer ${token.access_token ?? ""}` },
          }),
        );
        const bearerUser = yield* auth.currentUser(
          new Headers({ authorization: `Bearer ${token.access_token ?? ""}` }),
        );

        return {
          issuedStatus: issued.status,
          code,
          claimedStatus: claimed.status,
          approvedStatus: approved.status,
          redeemedStatus: redeemed.status,
          token,
          againStatus: again.status,
          againBody,
          session: yield* Effect.promise(() => session.json<GetSessionBody>()),
          bearerUser,
        };
      }),
    );

    expect(result.issuedStatus).toBe(200);
    expect(result.code.expires_in).toBe(15 * 60);
    expect(result.code.interval).toBe(5);
    expect(result.code.verification_uri).toBe(`${baseUrl}/device`);
    expect(result.code.verification_uri_complete).toBe(
      `${baseUrl}/device?user_code=${result.code.user_code}`,
    );
    expect(result.claimedStatus).toBe(200);
    expect(result.approvedStatus).toBe(200);
    expect(result.redeemedStatus).toBe(200);
    expect(result.token.token_type).toBe("Bearer");
    expect(result.token.access_token).toBeTruthy();
    expect(result.againStatus).toBe(400);
    expect(result.againBody.error).not.toBe("slow_down");
    expect(result.session.user.email).toBe(email);
    expect(result.bearerUser?.email).toBe(email);
  }, 30_000);

  it("tells a device polling an unapproved code to keep waiting", async () => {
    const result = await run(
      Effect.gen(function* () {
        const issued = yield* requestCode(clientId);
        const code = yield* Effect.promise(() => issued.json<DeviceCodeBody>());
        const pending = yield* redeem(code.device_code);
        return {
          pendingStatus: pending.status,
          pendingBody: yield* Effect.promise(() =>
            pending.json<DeviceTokenBody>(),
          ),
        };
      }),
    );

    expect(result.pendingStatus).toBe(400);
    expect(result.pendingBody.error).toBe("authorization_pending");
  });

  it("refuses a denied code and a client id outside the allow-list", async () => {
    const email = `denied-${crypto.randomUUID()}@example.com`;
    const result = await run(
      Effect.gen(function* () {
        const cookie = yield* signIn(email);
        const issued = yield* requestCode(clientId);
        const code = yield* Effect.promise(() => issued.json<DeviceCodeBody>());
        yield* claim(code.user_code, cookie);
        const denied = yield* decide("deny", code.user_code, cookie);
        const redeemed = yield* redeem(code.device_code);
        const body = yield* Effect.promise(() =>
          redeemed.json<DeviceTokenBody>(),
        );
        const unknownClient = yield* requestCode("not-the-mobile-app");
        return {
          deniedStatus: denied.status,
          redeemedStatus: redeemed.status,
          body,
          unknownClientStatus: unknownClient.status,
        };
      }),
    );

    expect(result.deniedStatus).toBe(200);
    expect(result.redeemedStatus).toBe(400);
    expect(result.body.error).toBe("access_denied");
    expect(result.unknownClientStatus).toBe(400);
  });
});
