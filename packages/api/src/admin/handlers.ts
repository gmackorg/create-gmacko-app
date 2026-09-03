import { AppApi } from "@gmacko/domain";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { internal, withUser } from "../boundary";
import { primitives } from "../settings/handlers";
import {
  AdminUsers,
  Bootstrap,
  LaunchControlsService,
  WaitlistReview,
} from "./service";

export const AdminHandlers = HttpApiBuilder.group(AppApi, "admin", (handlers) =>
  Effect.gen(function* () {
    const launch = yield* LaunchControlsService;
    const waitlist = yield* WaitlistReview;
    const bootstrap = yield* Bootstrap;
    const users = yield* AdminUsers;
    return handlers
      .handle("launchControls", () => withUser(() => launch.get))
      .handle("updateLaunchControls", ({ payload }) =>
        withUser(() => launch.update(payload)),
      )
      .handle("listWaitlistEntries", () => withUser(() => waitlist.list))
      .handle("reviewWaitlistEntry", ({ params, payload }) =>
        withUser((admin) => waitlist.review(admin.id, params.id, payload)),
      )
      .handle("bootstrapStatus", () => internal(bootstrap.status))
      .handle("completeBootstrap", ({ payload }) =>
        withUser((user) => bootstrap.complete(user.id, payload)),
      )
      .handle("stats", () => withUser(() => users.stats))
      .handle("listWorkspaces", () => withUser(() => users.listWorkspaces))
      .handle("listUsers", ({ query }) =>
        withUser(() => users.listUsers(query)),
      )
      .handle("updateUserRole", ({ params, payload }) =>
        withUser((admin) => users.updateRole(admin.id, params.userId, payload)),
      )
      .handle("getUser", ({ params }) =>
        withUser(() => users.getUser(params.userId)),
      );
  }),
).pipe(
  Layer.provide(
    Layer.mergeAll(
      LaunchControlsService.layer(primitives),
      WaitlistReview.layer,
      Bootstrap.layer,
      AdminUsers.layer,
    ),
  ),
);
