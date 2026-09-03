import { AppApi } from "@gmacko/domain";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

const todo = (name: string) => () =>
  Effect.die(new Error(`admin.${name} not implemented`));

export const AdminHandlers = HttpApiBuilder.group(AppApi, "admin", (handlers) =>
  handlers
    .handle("launchControls", todo("launchControls"))
    .handle("updateLaunchControls", todo("updateLaunchControls"))
    .handle("listWaitlistEntries", todo("listWaitlistEntries"))
    .handle("reviewWaitlistEntry", todo("reviewWaitlistEntry"))
    .handle("bootstrapStatus", todo("bootstrapStatus"))
    .handle("completeBootstrap", todo("completeBootstrap"))
    .handle("stats", todo("stats"))
    .handle("listWorkspaces", todo("listWorkspaces"))
    .handle("listUsers", todo("listUsers"))
    .handle("updateUserRole", todo("updateUserRole"))
    .handle("getUser", todo("getUser")),
);
