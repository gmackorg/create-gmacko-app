import type { Meta, StoryObj } from "@storybook/react-vite";

import { AdminSidebar } from "./admin-sidebar";

const meta = {
  title: "Admin/AdminSidebar",
  component: AdminSidebar,
  args: { currentPath: "/admin" },
  decorators: [
    (Story) => (
      <div className="h-[480px] overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {};
export const Users: Story = { args: { currentPath: "/admin/users" } };
