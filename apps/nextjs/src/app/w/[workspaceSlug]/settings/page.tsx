import { renderSettingsPage } from "../../../settings/page-content";

export default async function WorkspaceSettingsPage(props: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const params = await props.params;
  return renderSettingsPage({ workspaceSlug: params.workspaceSlug });
}
