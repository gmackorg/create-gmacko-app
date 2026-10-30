import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { type ScopeOption, ScopePicker } from "./scope-picker";

const options: ReadonlyArray<ScopeOption> = [
  { value: "posts:write", description: "Create posts" },
  { value: "posts:delete", description: "Delete posts" },
  {
    value: "workspace:read",
    description: "Read the workspace, its members and invites",
  },
  { value: "workspace:invite", description: "Invite people to the workspace" },
  { value: "billing:read", description: "Read the workspace's plan and usage" },
  { value: "preferences:read", description: "Read your preferences" },
  { value: "preferences:write", description: "Change your preferences" },
  { value: "profile:read", description: "Read your profile" },
  { value: "api_keys:read", description: "List your API keys" },
];

const meta = {
  title: "Settings/ScopePicker",
  component: ScopePicker,
  args: {
    options,
    value: ["workspace:read", "billing:read", "profile:read"],
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <ScopePicker {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof ScopePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadsSelected: Story = {};

export const NothingSelected: Story = { args: { value: [] } };

export const Disabled: Story = { args: { disabled: true } };
