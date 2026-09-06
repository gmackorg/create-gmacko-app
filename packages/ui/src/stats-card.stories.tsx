import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatsCard } from "./stats-card";

const meta = {
  title: "Admin/StatsCard",
  component: StatsCard,
  args: { title: "Total Users", value: 128 },
} satisfies Meta<typeof StatsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { loading: true } };
