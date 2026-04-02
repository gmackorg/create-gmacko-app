export function buildWorkspaceHomePath(workspaceSlug: string) {
  return `/w/${workspaceSlug}`;
}

export function buildWorkspaceSettingsPath(workspaceSlug: string) {
  return `${buildWorkspaceHomePath(workspaceSlug)}/settings`;
}

export function getWorkspaceSlugFromPathname(pathname: string | null) {
  if (!pathname) {
    return null;
  }

  const match = pathname.match(/^\/w\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export function getWorkspaceSelectionHeaders(pathname: string | null) {
  const headers = new Headers();
  const workspaceSlug = getWorkspaceSlugFromPathname(pathname);

  if (workspaceSlug) {
    headers.set("x-gmacko-workspace-slug", workspaceSlug);
  }

  return headers;
}

export function getPostBootstrapSettingsPath(input: {
  tenancyMode: "single-tenant" | "multi-tenant";
  workspaceSlug: string | null | undefined;
}) {
  if (input.tenancyMode === "multi-tenant" && input.workspaceSlug) {
    return buildWorkspaceSettingsPath(input.workspaceSlug);
  }

  return "/settings";
}
