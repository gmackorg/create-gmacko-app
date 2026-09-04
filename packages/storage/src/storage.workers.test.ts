/**
 * The claim `@gmacko/storage` makes is that UploadThing works on Cloudflare
 * Workers, so this suite runs the real fetch adapter on workerd
 * (`@cloudflare/vitest-pool-workers`), not on Node.
 *
 * `createRouteHandler` is exercised directly rather than through
 * `createStorageHandler`, because the integration flag is off in the
 * template's `gmacko.integrations.json` and the guard would answer 404 before
 * UploadThing ever loaded. The token is a syntactically valid fake: the GET
 * route answers from the router definition and never calls UploadThing.
 */
import { describe, expect, it } from "vitest";

import {
  createRouteHandler,
  createUploadthing,
  UploadThingError,
  UTApi,
} from "./index";

/** UploadThing's token is base64 JSON; no network call validates it here. */
const token = btoa(
  JSON.stringify({
    apiKey: "sk_live_0000000000000000000000000000000000000000000000000000",
    appId: "gmackotest",
    regions: ["sea1"],
  }),
);

/**
 * One file type's limits, as `f({ image: { … } })` declares them and the GET
 * route serialises them back.
 */
interface FileTypeConfig {
  readonly maxFileSize?: string;
  readonly maxFileCount?: number;
}

/** One entry of the GET route's body: a file route and its permissions. */
interface RouteConfigEntry {
  readonly slug: string;
  readonly config: Readonly<Record<string, FileTypeConfig>>;
}

const f = createUploadthing();

const router = {
  avatar: f({ image: { maxFileSize: "1MB", maxFileCount: 1 } })
    .middleware(({ req }) => {
      const user = req.headers.get("x-user");
      if (user === null) throw new UploadThingError("unauthorized");
      return { userId: user };
    })
    .onUploadComplete(({ metadata, file }) => ({
      userId: metadata.userId,
      url: file.ufsUrl,
    })),
};

const handler = createRouteHandler({
  router,
  config: { token, isDev: false, logLevel: "Error" },
});

describe("uploadthing on workerd", () => {
  it("loads without a Node built-in and answers a Request with a Response", async () => {
    const response = await handler(
      new Request("https://example.com/api/uploadthing"),
    );
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
  });

  it("serves the router config from the GET route", async () => {
    const response = await handler(
      new Request("https://example.com/api/uploadthing"),
    );
    const body: ReadonlyArray<RouteConfigEntry> = await response.json();
    expect(body.map((route) => route.slug)).toEqual(["avatar"]);
    expect(body[0]?.config).toHaveProperty("image");
  });

  it("refuses an unknown slug rather than throwing", async () => {
    const response = await handler(
      new Request(
        "https://example.com/api/uploadthing?slug=nope&actionType=upload",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-uploadthing-package": "test",
          },
          body: JSON.stringify({ files: [] }),
        },
      ),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("constructs UTApi in an isolate", () => {
    expect(new UTApi({ token })).toBeInstanceOf(UTApi);
  });
});
