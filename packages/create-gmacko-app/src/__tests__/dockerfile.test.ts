import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("root Dockerfile workspace copies", () => {
  it("copies the full packages and tooling directories from the deps stage", () => {
    const dockerfile = fs.readFileSync(
      path.resolve(process.cwd(), "../../Dockerfile"),
      "utf8",
    );

    expect(dockerfile).toContain("COPY --from=deps /app/packages ./packages");
    expect(dockerfile).toContain("COPY --from=deps /app/tooling ./tooling");
    expect(dockerfile).toContain("ENV SKIP_ENV_VALIDATION=1");
  });
});
