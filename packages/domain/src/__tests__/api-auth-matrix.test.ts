/**
 * docs/API_AUTH.md is generated from AppApi; a stale copy fails here.
 * Regenerate with `pnpm -F @gmacko/domain docs:api-auth`.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  API_AUTH_PATH,
  renderApiAuthMatrix,
} from "../../scripts/api-auth-matrix";

describe("docs/API_AUTH.md", () => {
  it("is the rendering of the current contract", () => {
    const rendered = renderApiAuthMatrix();
    expect(rendered).toContain(
      "| health | `forge` | GET | `/.well-known/forge-health` | public |",
    );
    expect(rendered).toContain(
      "| settings | `deleteAccount` | DELETE | `/api/account` | `Session` |",
    );
    expect(readFileSync(API_AUTH_PATH, "utf8")).toBe(rendered);
  });
});
