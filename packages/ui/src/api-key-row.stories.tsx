import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ApiKeyRow } from "./api-key-row";
import { ApiKeySecret } from "./api-key-secret";

const meta = {
  title: "Settings/ApiKeyRow",
  component: ApiKeyRow,
  args: {
    apiKey: {
      id: "key_1",
      name: "CI deploy key",
      keyPrefix: "gmk_a1b2c3d4",
      permissions: ["read", "write"],
      lastUsedAt: new Date("2026-09-01T12:30:00Z"),
      expiresAt: null,
      createdAt: new Date("2026-08-01T00:00:00Z"),
    },
    onRevoke: () => {},
  },
} satisfies Meta<typeof ApiKeyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NeverUsedExpiring: Story = {
  args: {
    apiKey: {
      id: "key_2",
      name: "Trial key",
      keyPrefix: "gmk_zz99yy88",
      permissions: ["read"],
      lastUsedAt: null,
      expiresAt: new Date("2026-12-31T00:00:00Z"),
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  },
};

export const Disabled: Story = { args: { disabled: true } };

function SecretDemo() {
  const [secret, setSecret] = useState<string | null>(
    "gmk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  );
  return secret ? (
    <ApiKeySecret secret={secret} onDismiss={() => setSecret(null)} />
  ) : (
    <p className="text-muted-foreground text-sm">Dismissed.</p>
  );
}

export const WithSecretReveal: Story = {
  render: (args) => (
    <div className="space-y-4">
      <SecretDemo />
      <ApiKeyRow {...args} />
    </div>
  ),
};
