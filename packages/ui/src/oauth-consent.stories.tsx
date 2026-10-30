import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { OAuthConsentCard } from "./oauth-consent";

const meta = {
  title: "OAuth/ConsentCard",
  component: OAuthConsentCard,
  args: {
    client: {
      name: "Claude",
      redirectHost: "claude.ai",
      verified: false,
    },
    workspaceName: "Acme",
    options: [
      { value: "posts:write", description: "Create posts" },
      {
        value: "workspace:read",
        description: "Read the workspace, its members and invites",
      },
      { value: "profile:read", description: "Read your profile" },
    ],
    value: ["workspace:read", "profile:read"],
    onChange: () => {},
    onApprove: () => {},
    onDeny: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <OAuthConsentCard {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof OAuthConsentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnverifiedClient: Story = {};

export const VerifiedClient: Story = {
  args: {
    client: {
      name: "Ops dashboard",
      redirectHost: "ops.example.com",
      verified: true,
    },
  },
};

export const NothingAllowed: Story = { args: { value: [] } };

export const Submitting: Story = { args: { submitting: true } };
