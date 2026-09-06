import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { SettingsCard, SettingsPanel, SettingsSkeleton } from "./settings-card";

const meta = {
  title: "Settings/SettingsCard",
  component: SettingsCard,
  args: {
    title: "Billing",
    description:
      "Billing stays per-workspace in v1. Seat billing is intentionally out of scope for this first pass.",
  },
} satisfies Meta<typeof SettingsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className="grid gap-4 md:grid-cols-2">
        <SettingsPanel title="Current plan">
          <p className="text-muted-foreground mt-2 text-sm">
            No workspace plan is configured yet.
          </p>
        </SettingsPanel>
        <SettingsPanel title="Subscription status">
          <p className="text-muted-foreground mt-2 text-sm">
            No paid subscription is attached yet.
          </p>
        </SettingsPanel>
      </div>
    ),
  },
};

export const WithActions: Story = {
  args: {
    title: "API Keys",
    description: undefined,
    actions: <Button size="sm">Create New Key</Button>,
    children: <p className="text-muted-foreground">No API keys created yet.</p>,
  },
};

export const Skeleton: Story = {
  render: () => <SettingsSkeleton title="Preferences" />,
};
