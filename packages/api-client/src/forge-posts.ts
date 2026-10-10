import { Schema } from "effect";

/**
 * Local product host. apps/forge serves this. The web Worker does not.
 * 127.0.0.1 is the machine the simulator and the browser share. A physical
 * device or the Android emulator needs that machine's reachable address.
 */
export const FORGE_ORIGIN = "http://127.0.0.1:8787";

const TENANT = "local";
const ACTOR = "web";

export class ForgePost extends Schema.Class<ForgePost>("ForgePost")({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

const PostPage = Schema.Struct({
  items: Schema.Array(ForgePost),
  next: Schema.NullOr(Schema.String),
  limit: Schema.Number,
});

const decodePage = Schema.decodeUnknownSync(PostPage);
const decodePost = Schema.decodeUnknownSync(ForgePost);

export class MissingForgePost extends Error {
  readonly id: string;
  constructor(id: string) {
    super("Post not found");
    this.name = "MissingForgePost";
    this.id = id;
  }
}

export class ForgeProductError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function call(
  method: string,
  path: string,
  init?: { readonly body?: string; readonly ifMatch?: string },
): Promise<{ readonly text: string; readonly etag: string | null }> {
  const headers = new Headers({
    accept: "application/json",
    "x-forge-tenant": TENANT,
    "x-forge-actor": ACTOR,
  });
  if (init?.body !== undefined) headers.set("content-type", "application/json");
  if (init?.ifMatch !== undefined) headers.set("if-match", init.ifMatch);
  const response = await fetch(`${FORGE_ORIGIN}${path}`, {
    method,
    headers,
    body: init?.body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ForgeProductError(
      response.status,
      `Forge ${method} ${path} failed (${response.status}).`,
    );
  }
  return { text, etag: response.headers.get("etag") };
}

export const forgePosts = {
  list: async (): Promise<ReadonlyArray<ForgePost>> => {
    const { text } = await call("GET", "/v1/posts");
    return decodePage(JSON.parse(text)).items;
  },
  create: async (input: {
    readonly title: string;
    readonly content: string;
  }): Promise<ForgePost> => {
    const { text } = await call("POST", "/v1/posts", {
      body: JSON.stringify(input),
    });
    return decodePost(JSON.parse(text));
  },
  remove: async (id: string): Promise<void> => {
    // Post is not @versioned, so the host accepts DELETE without If-Match.
    // When a read returns an ETag, send it back.
    const found = await call("GET", `/v1/posts/${encodeURIComponent(id)}`);
    await call(
      "DELETE",
      `/v1/posts/${encodeURIComponent(id)}`,
      found.etag === null ? undefined : { ifMatch: found.etag },
    );
  },
};
