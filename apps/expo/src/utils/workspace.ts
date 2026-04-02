export function buildWorkspaceRequestHeaders(workspaceId: string | null) {
  const headers = new Map<string, string>();

  if (workspaceId) {
    headers.set("x-gmacko-workspace-id", workspaceId);
  }

  return headers;
}
