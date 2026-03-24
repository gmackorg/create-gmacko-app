import { beforeEach, describe, expect, it, vi } from "vitest";

const promptMocks = vi.hoisted(() => {
  const multiselect = vi.fn();
  return {
    multiselect,
    intro: vi.fn(),
    outro: vi.fn(),
    log: {
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      message: vi.fn(),
    },
    spinner: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    })),
    isCancel: vi.fn(() => false),
  };
});

vi.mock("@clack/prompts", () => promptMocks);
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execSync: vi.fn(() => ""),
}));

describe("provisioning guidance", () => {
  beforeEach(() => {
    vi.resetModules();
    promptMocks.multiselect.mockReset();
    promptMocks.multiselect.mockResolvedValue([]);
  });

  it("offers ForgeGraph and colocated Postgres instead of Neon and Vercel", async () => {
    const { runProvisioning } = await import("../provision.js");

    await runProvisioning({
      projectPath: "/tmp/test-app",
      appName: "test-app",
      platforms: {
        web: true,
        mobile: true,
      },
    });

    expect(promptMocks.multiselect).toHaveBeenCalledTimes(1);

    const promptCall = promptMocks.multiselect.mock.calls[0]?.[0];
    const labels = (promptCall?.options ?? []).map(
      (option: { label: string }) => option.label,
    );

    expect(labels).toContain("ForgeGraph Deployment");
    expect(labels).toContain("Postgres Setup");
    expect(labels).not.toContain("Neon Database");
    expect(labels).not.toContain("Vercel Deployment");
  });
});
