/**
 * The guards, on Node: with `integrations.storage.enabled` false (the
 * template's default) nothing initialises UploadThing and a mounted route is
 * inert rather than a 500.
 */
import { describe, expect, it } from "vitest";

import {
  createFileRouter,
  createGuardedRouter,
  createStorageHandler,
  isStorageEnabled,
} from "./index";

describe("with storage disabled", () => {
  it("reports the integration as off", () => {
    expect(isStorageEnabled()).toBe(false);
  });

  it("does not build a file router", () => {
    expect(createFileRouter()).toBeNull();
  });

  it("does not evaluate the route definitions", () => {
    let built = 0;
    const router = createGuardedRouter(() => {
      built += 1;
      return {};
    });
    expect(built).toBe(0);
    expect(router).toEqual({});
  });

  it("answers 404 from a route left mounted", async () => {
    const handler = createStorageHandler({ router: {} });
    const response = await handler(
      new Request("https://example.com/api/uploadthing"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "storage is not enabled" });
  });
});
