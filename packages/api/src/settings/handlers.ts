import { ApiKeys } from "@gmacko/auth/api-keys";
import { toWebHeaders } from "@gmacko/auth/middleware";
import { Auth } from "@gmacko/auth/service";
import { AppApi } from "@gmacko/domain";
import { Effect, Layer } from "effect";
import {
  Cookies,
  HttpEffect,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { internal, requestContext, withUser } from "../boundary";
import { Billing } from "./billing";
import { primitives } from "./primitives";
import {
  Account,
  Launch,
  Preferences,
  SettingsServicesLive,
  toApiKeyCreate,
  Waitlist,
  Workspaces,
} from "./service";

export const SettingsHandlers = HttpApiBuilder.group(
  AppApi,
  "settings",
  (handlers) =>
    Effect.gen(function* () {
      const launch = yield* Launch;
      const waitlist = yield* Waitlist;
      const workspaces = yield* Workspaces;
      const billing = yield* Billing;
      const preferences = yield* Preferences;
      const keys = yield* ApiKeys;
      const account = yield* Account;
      const auth = yield* Auth;
      return handlers
        .handle("launchState", () => internal(launch.state))
        .handle("submitWaitlistEntry", ({ payload }) =>
          internal(waitlist.submit(payload)),
        )
        .handle("workspaceContext", () =>
          withUser((user) =>
            Effect.flatMap(requestContext, (request) =>
              workspaces.context(user.id, request),
            ),
          ),
        )
        .handle("platformPrimitives", () =>
          withUser(() => Effect.succeed(primitives)),
        )
        .handle("billingOverview", () =>
          withUser((user) =>
            Effect.flatMap(requestContext, (request) =>
              billing.overview(user.id, request),
            ),
          ),
        )
        .handle("listInvites", () =>
          withUser((user) =>
            Effect.flatMap(requestContext, (request) =>
              workspaces.listInvites(user.id, request),
            ),
          ),
        )
        .handle("createInvite", ({ payload }) =>
          withUser((user) =>
            Effect.flatMap(requestContext, (request) =>
              workspaces.createInvite(user.id, payload, request),
            ),
          ),
        )
        .handle("acceptInvite", ({ params }) =>
          withUser((user) =>
            Effect.flatMap(requestContext, (request) =>
              workspaces.acceptInvite(user, params.inviteId, request),
            ),
          ),
        )
        .handle("getPreferences", () =>
          withUser((user) => preferences.get(user.id)),
        )
        .handle("updatePreferences", ({ payload }) =>
          withUser((user) => preferences.update(user.id, payload)),
        )
        .handle("listApiKeys", () => withUser((user) => keys.list(user.id)))
        .handle("createApiKey", ({ payload }) =>
          withUser((user) => keys.create(user.id, toApiKeyCreate(payload))),
        )
        .handle("revokeApiKey", ({ params }) =>
          withUser((user) => keys.revoke(user.id, params.id)),
        )
        .handle("deleteAccount", () =>
          withUser((user) =>
            Effect.gen(function* () {
              const request = yield* HttpServerRequest.HttpServerRequest;
              yield* account.deleteAccount(user.id);
              // With the row gone the session no longer authenticates
              // (`RequestContext.session` checks the cookie cache against
              // it), but the browser would keep sending the cookies until
              // they expired. better-auth's sign-out revokes the session
              // (already cascaded) and hands back the `Set-Cookie` values
              // that expire every auth cookie, `__Secure-` names included;
              // they go on this response through a pre-response handler,
              // as the router sends the 204 as soon as the handler returns.
              const cleared = yield* auth.signOut(toWebHeaders(request));
              yield* HttpEffect.appendPreResponseHandler((_request, response) =>
                Effect.succeed(
                  HttpServerResponse.mergeCookies(
                    response,
                    Cookies.fromSetCookie(cleared),
                  ),
                ),
              );
            }),
          ),
        );
    }),
).pipe(Layer.provide(Layer.mergeAll(SettingsServicesLive, Billing.layer)));
