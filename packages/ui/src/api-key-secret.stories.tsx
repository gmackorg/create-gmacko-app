import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { ApiKeySecret } from "./api-key-secret";

const meta = {
  title: "Settings/ApiKeySecret",
  component: ApiKeySecret,
  args: {
    secret: "gmk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
    onDismiss: fn(),
    onCopied: fn(),
  },
} satisfies Meta<typeof ApiKeySecret>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Freshly minted: the key is masked past its prefix. */
export const Masked: Story = {};

/** After "Reveal": the plaintext is shown and the button reads "Hide". */
export const Revealed: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Reveal" }));
    await canvas.findByRole("button", { name: "Hide" });
  },
};

/** After "Copy": the button reads "Copied" and `onCopied` has fired. */
export const Copied: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy" }));
    await canvas.findByRole("button", { name: "Copied" });
  },
};
