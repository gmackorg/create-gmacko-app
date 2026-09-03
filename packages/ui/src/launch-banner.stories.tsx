import type { Meta, StoryObj } from "@storybook/react-vite";

import { LaunchBanner } from "./launch-banner";

const meta = {
  title: "Marketing/LaunchBanner",
  component: LaunchBanner,
  args: {
    announcementMessage: "Invites open next week.",
    announcementTone: "info",
    maintenanceMode: false,
  },
} satisfies Meta<typeof LaunchBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Warning: Story = {
  args: {
    announcementTone: "warning",
    announcementMessage: "Sign-ups pause tonight.",
  },
};
export const Maintenance: Story = {
  args: {
    announcementTone: "critical",
    maintenanceMode: true,
    announcementMessage: null,
  },
};
