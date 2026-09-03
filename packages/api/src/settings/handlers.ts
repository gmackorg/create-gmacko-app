import { AppApi } from "@gmacko/domain";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

const todo = (name: string) => () =>
  Effect.die(new Error(`settings.${name} not implemented`));

export const SettingsHandlers = HttpApiBuilder.group(
  AppApi,
  "settings",
  (handlers) =>
    handlers
      .handle("launchState", todo("launchState"))
      .handle("submitWaitlistEntry", todo("submitWaitlistEntry"))
      .handle("workspaceContext", todo("workspaceContext"))
      .handle("platformPrimitives", todo("platformPrimitives"))
      .handle("billingOverview", todo("billingOverview"))
      .handle("listInvites", todo("listInvites"))
      .handle("createInvite", todo("createInvite"))
      .handle("acceptInvite", todo("acceptInvite"))
      .handle("getPreferences", todo("getPreferences"))
      .handle("updatePreferences", todo("updatePreferences"))
      .handle("listApiKeys", todo("listApiKeys"))
      .handle("createApiKey", todo("createApiKey"))
      .handle("revokeApiKey", todo("revokeApiKey"))
      .handle("deleteAccount", todo("deleteAccount")),
);
