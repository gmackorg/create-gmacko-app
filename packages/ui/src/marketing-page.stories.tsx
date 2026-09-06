import type { Meta, StoryObj } from "@storybook/react-vite";

import { MarketingCard, MarketingPage } from "./marketing-page";

const meta = {
  title: "Marketing/MarketingPage",
  component: MarketingPage,
  args: {
    eyebrow: "Pricing",
    title: "Simple pricing for the first launch",
    description:
      "Start with a free workspace, then layer plans and limits when the product is ready.",
  },
} satisfies Meta<typeof MarketingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCards: Story = {
  args: {
    children: (
      <div className="grid gap-4 md:grid-cols-2">
        <MarketingCard>
          <h2 className="text-xl font-semibold">Free</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            One workspace, core product access, and the standard launch shell.
          </p>
        </MarketingCard>
        <MarketingCard>
          <h2 className="text-xl font-semibold">Pro</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Add limits, metering, collaboration, and billing controls.
          </p>
        </MarketingCard>
      </div>
    ),
  },
};
