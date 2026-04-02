import * as SecureStore from "expo-secure-store";

const activeWorkspaceKey = "active_workspace_id";

export const getActiveWorkspaceId = () =>
  SecureStore.getItem(activeWorkspaceKey);
export const clearActiveWorkspaceId = () =>
  SecureStore.deleteItemAsync(activeWorkspaceKey);
export const setActiveWorkspaceId = (workspaceId: string) =>
  SecureStore.setItem(activeWorkspaceKey, workspaceId);
