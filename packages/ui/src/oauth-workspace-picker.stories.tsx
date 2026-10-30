import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { OAuthWorkspacePicker } from "./oauth-workspace-picker";

const meta = {
  title: "OAuth/WorkspacePicker",
  component: OAuthWorkspacePicker,
  args: {
    clientName: "Claude",
    workspaces: [
      { id: "w1", name: "Acme", role: "owner" },
      { id: "w2", name: "Side project", role: "member" },
    ],
    value: null,
    onChange: () => {},
    onContinue: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <OAuthWorkspacePicker {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof OAuthWorkspacePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NothingPicked: Story = {};

export const Picked: Story = { args: { value: "w1" } };

export const NoWorkspaces: Story = { args: { workspaces: [] } };
