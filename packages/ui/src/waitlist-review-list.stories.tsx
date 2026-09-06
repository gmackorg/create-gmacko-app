import type { Meta, StoryObj } from "@storybook/react-vite";

import { WaitlistReviewList } from "./waitlist-review-list";

const meta = {
  title: "Admin/WaitlistReviewList",
  component: WaitlistReviewList,
  args: {
    entries: [
      {
        id: "w1",
        email: "founder@example.com",
        source: "landing",
        status: "pending",
        message: "Building an internal tool for a 40-person team.",
        referralCode: null,
        createdAt: new Date("2026-09-01T09:00:00Z"),
        reviewedAt: null,
      },
      {
        id: "w2",
        email: "ops@example.com",
        source: "contact",
        status: "approved",
        message: null,
        referralCode: "FRIEND",
        createdAt: new Date("2026-08-28T09:00:00Z"),
        reviewedAt: new Date("2026-08-29T10:00:00Z"),
      },
    ],
    onReview: () => {},
  },
} satisfies Meta<typeof WaitlistReviewList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { entries: [] } };
export const Disabled: Story = { args: { disabled: true } };
