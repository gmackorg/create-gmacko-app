import type { Meta, StoryObj } from "@storybook/react-vite";

import { ConnectedAppRow } from "./connected-app-row";

const meta = {
  title: "Settings/ConnectedAppRow",
  component: ConnectedAppRow,
  args: {
    app: {
      id: "consent_1",
      clientName: "Claude",
      workspaceName: "Acme",
      scopes: ["workspace:read", "posts:write"],
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
    onRevoke: () => {},
  },
} satisfies Meta<typeof ConnectedAppRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WorkspaceDeleted: Story = {
  args: {
    app: {
      id: "consent_2",
      clientName: null,
      workspaceName: null,
      scopes: ["profile:read"],
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  },
};
