import type { Meta, StoryObj } from "@storybook/react-vite";

import { LaunchControlsForm } from "./launch-controls-form";

const meta = {
  title: "Admin/LaunchControlsForm",
  component: LaunchControlsForm,
  args: {
    values: {
      maintenanceMode: false,
      signupEnabled: true,
      announcementMessage: null,
      announcementTone: "info",
      allowedEmailDomains: [],
    },
    onSubmit: () => {},
  },
} satisfies Meta<typeof LaunchControlsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const InviteOnlyWithAnnouncement: Story = {
  args: {
    values: {
      maintenanceMode: false,
      signupEnabled: false,
      announcementMessage: "Invites open next week.",
      announcementTone: "warning",
      allowedEmailDomains: ["example.com", "partner.org"],
    },
  },
};

export const Submitting: Story = { args: { submitting: true } };
