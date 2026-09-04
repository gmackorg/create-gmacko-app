import {
  ApiKeyId,
  CreateApiKey,
  CreateInvite,
  InviteId,
  UpdatePreferences,
  WaitlistSubmit,
} from "@gmacko/domain";
import { mutationOptions, queryOptions } from "@tanstack/react-query";

import type { ApiClient } from "../client";
import { invalidates } from "./invalidation";
import { queryKeys } from "./keys";

export type WaitlistSubmitInput = ConstructorParameters<
  typeof WaitlistSubmit
>[0];
export type CreateInviteInput = ConstructorParameters<typeof CreateInvite>[0];
export type UpdatePreferencesInput = ConstructorParameters<
  typeof UpdatePreferences
>[0];
export type CreateApiKeyInput = ConstructorParameters<typeof CreateApiKey>[0];

export const settingsQueries = (api: ApiClient) => ({
  launchState: () =>
    queryOptions({
      queryKey: queryKeys.settings.launchState(),
      queryFn: () => api.run((c) => c.settings.launchState()),
    }),
  workspaceContext: () =>
    queryOptions({
      queryKey: queryKeys.settings.workspaceContext(),
      queryFn: () => api.run((c) => c.settings.workspaceContext()),
    }),
  platformPrimitives: () =>
    queryOptions({
      queryKey: queryKeys.settings.platformPrimitives(),
      queryFn: () => api.run((c) => c.settings.platformPrimitives()),
    }),
  billingOverview: () =>
    queryOptions({
      queryKey: queryKeys.settings.billingOverview(),
      queryFn: () => api.run((c) => c.settings.billingOverview()),
    }),
  /** `Forbidden{reason: "role"}` unless the caller manages the workspace; gate on `workspaceContext.canManageWorkspace`. */
  listInvites: () =>
    queryOptions({
      queryKey: queryKeys.settings.listInvites(),
      queryFn: () => api.run((c) => c.settings.listInvites()),
    }),
  getPreferences: () =>
    queryOptions({
      queryKey: queryKeys.settings.getPreferences(),
      queryFn: () => api.run((c) => c.settings.getPreferences()),
    }),
  listApiKeys: () =>
    queryOptions({
      queryKey: queryKeys.settings.listApiKeys(),
      queryFn: () => api.run((c) => c.settings.listApiKeys()),
    }),
});

export const settingsMutations = (api: ApiClient) => ({
  submitWaitlistEntry: () =>
    mutationOptions({
      mutationKey: [...queryKeys.settings.all, "submitWaitlistEntry"],
      mutationFn: (input: WaitlistSubmitInput) =>
        api.run((c) =>
          c.settings.submitWaitlistEntry({
            payload: new WaitlistSubmit(input),
          }),
        ),
      meta: invalidates("settings.submitWaitlistEntry"),
    }),
  createInvite: () =>
    mutationOptions({
      mutationKey: [...queryKeys.settings.all, "createInvite"],
      mutationFn: (input: CreateInviteInput) =>
        api.run((c) =>
          c.settings.createInvite({ payload: new CreateInvite(input) }),
        ),
      meta: invalidates("settings.createInvite"),
    }),
  acceptInvite: () =>
    mutationOptions({
      mutationKey: [...queryKeys.settings.all, "acceptInvite"],
      mutationFn: (inviteId: string) =>
        api.run((c) =>
          c.settings.acceptInvite({
            params: { inviteId: InviteId.make(inviteId) },
          }),
        ),
      meta: invalidates("settings.acceptInvite"),
    }),
  updatePreferences: () =>
    mutationOptions({
      mutationKey: [...queryKeys.settings.all, "updatePreferences"],
      mutationFn: (input: UpdatePreferencesInput) =>
        api.run((c) =>
          c.settings.updatePreferences({
            payload: new UpdatePreferences(input),
          }),
        ),
      meta: invalidates("settings.updatePreferences"),
    }),
  /** Needs the `admin` scope on a key (any session works); the response carries the plaintext key once. */
  createApiKey: () =>
    mutationOptions({
      mutationKey: [...queryKeys.settings.all, "createApiKey"],
      mutationFn: (input: CreateApiKeyInput) =>
        api.run((c) =>
          c.settings.createApiKey({ payload: new CreateApiKey(input) }),
        ),
      meta: invalidates("settings.createApiKey"),
    }),
  revokeApiKey: () =>
    mutationOptions({
      mutationKey: [...queryKeys.settings.all, "revokeApiKey"],
      mutationFn: (id: string) =>
        api.run((c) =>
          c.settings.revokeApiKey({ params: { id: ApiKeyId.make(id) } }),
        ),
      meta: invalidates("settings.revokeApiKey"),
    }),
  /** Session only: a bearer key, even `admin`, is `Forbidden{reason: "scope"}`. */
  deleteAccount: () =>
    mutationOptions({
      mutationKey: [...queryKeys.settings.all, "deleteAccount"],
      mutationFn: () => api.run((c) => c.settings.deleteAccount()),
      meta: invalidates("settings.deleteAccount"),
    }),
});
