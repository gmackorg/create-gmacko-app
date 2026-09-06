import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { UsersTable } from "./users-table";

const meta = {
  title: "Admin/UsersTable",
  component: UsersTable,
  args: {
    users: [
      {
        id: "u1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "admin",
        image: null,
        emailVerified: true,
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        id: "u2",
        name: "Grace Hopper",
        email: "grace@example.com",
        role: "user",
        image: null,
        emailVerified: false,
        createdAt: new Date("2026-08-15T00:00:00Z"),
      },
    ],
    onRoleChange: () => {},
  },
} satisfies Meta<typeof UsersTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { users: [] } };

export const Paginated: Story = {
  args: {
    footer: (
      <>
        <span className="text-muted-foreground">Showing 1-20 of 57</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled>
            Previous
          </Button>
          <Button size="sm" variant="outline">
            Next
          </Button>
        </div>
      </>
    ),
  },
};
