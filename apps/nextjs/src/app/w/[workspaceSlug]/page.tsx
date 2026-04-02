import { redirect } from "next/navigation";

import { buildWorkspaceSettingsPath } from "~/lib/workspace";

export default async function WorkspaceHomePage(props: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const params = await props.params;
  redirect(buildWorkspaceSettingsPath(params.workspaceSlug));
}
