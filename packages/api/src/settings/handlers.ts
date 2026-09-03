import { ApiKeys } from "@gmacko/auth/api-keys";
import { platformPrimitives } from "@gmacko/config";
import { AppApi } from "@gmacko/domain";
import { PlatformPrimitives } from "@gmacko/domain/settings";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { internal, requestContext, withUser } from "../boundary";
import { Billing } from "./billing";
import {
  Account,
  Launch,
  Preferences,
  SettingsServicesLive,
  Waitlist,
  Workspaces,
} from "./service";

/** A constant from `@gmacko/config`; the same object `admin.launchControls` embeds. */
export const primitives = new PlatformPrimitives({
  featureFlags: {
    enabled: platformPrimitives.featureFlags.enabled,
    provider: platformPrimitives.featureFlags.provider,
  },
  jobs: {
    enabled: platformPrimitives.jobs.enabled,
    provider: platformPrimitives.jobs.provider,
  },
  rateLimits: {
    enabled: platformPrimitives.rateLimits.enabled,
    scopes: [...platformPrimitives.rateLimits.scopes],
  },
  botProtection: {
    enabled: platformPrimitives.botProtection.enabled,
    provider: platformPrimitives.botProtection.provider,
  },
  compliance: {
    enabled: platformPrimitives.compliance.enabled,
    dataExport: platformPrimitives.compliance.dataExport,
    dataDeletion: platformPrimitives.compliance.dataDeletion,
  },
  emailDelivery: {
    enabled: platformPrimitives.emailDelivery.enabled,
    provider: platformPrimitives.emailDelivery.provider,
    requiredEnv: [...platformPrimitives.emailDelivery.requiredEnv],
  },
});

const DAY_MS = 24 * 60 * 60 * 1000;

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
          withUser((user) =>
            keys.create(user.id, {
              name: payload.name,
              permissions: payload.permissions,
              expiresAt:
                payload.expiresInDays === undefined
                  ? undefined
                  : new Date(Date.now() + payload.expiresInDays * DAY_MS),
            }),
          ),
        )
        .handle("revokeApiKey", ({ params }) =>
          withUser((user) => keys.revoke(user.id, params.id)),
        )
        .handle("deleteAccount", () =>
          withUser((user) => account.deleteAccount(user.id)),
        );
    }),
).pipe(Layer.provide(Layer.mergeAll(SettingsServicesLive, Billing.layer)));
