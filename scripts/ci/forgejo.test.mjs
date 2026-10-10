import assert from "node:assert/strict";
import { test } from "node:test";

async function preview(t, replies) {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin, "https://git.forgegraf.com");
    assert.equal(options.headers.Authorization, "token fixture-token");
    const next = replies.shift();
    assert.ok(next, `Unexpected call: ${url}`);
    assert.equal(url.pathname + url.search, next.path);
    assert.equal(options.method, next.method || "GET");
    if (next.body) next.body(JSON.parse(options.body));
    return new Response(JSON.stringify(next.response ?? {}), {
      status: next.status || 200,
    });
  });
  const saved = { ...process.env };
  const argv = process.argv;
  Object.assign(process.env, {
    FORGEJO_SERVER_URL: "https://git.forgegraf.com",
    FORGEJO_REPOSITORY: "fixture/app",
    FORGEJO_TOKEN: "fixture-token",
    FORGEJO_PR_NUMBER: "13",
    PREVIEW_URL: "https://preview.workers.dev",
  });
  process.argv = ["node", "forgejo.mjs", "preview"];
  try {
    await import(`./forgejo.mjs?test=${Math.random()}`);
  } finally {
    process.argv = argv;
    process.env = saved;
  }
  assert.equal(replies.length, 0);
}
test("preview updates only the job identity’s existing Forgejo comment", async (t) => {
  await preview(t, [
    { path: "/api/v1/user", response: { id: 7 } },
    {
      path: "/api/v1/repos/fixture/app/issues/13/comments?limit=50&page=1",
      response: [
        { id: 1, user: { id: 9 }, body: "## Preview deploy\nHuman comment" },
        { id: 2, user: { id: 7 }, body: "## Preview deploy\nPrevious preview" },
      ],
    },
    {
      path: "/api/v1/repos/fixture/app/issues/comments/2",
      method: "PATCH",
      body: (data) => assert.match(data.body, /https:\/\/preview.workers.dev/),
    },
  ]);
});
test("preview creates a Forgejo comment when none belongs to the job identity", async (t) => {
  await preview(t, [
    { path: "/api/v1/user", response: { id: 7 } },
    {
      path: "/api/v1/repos/fixture/app/issues/13/comments?limit=50&page=1",
      response: [],
    },
    { path: "/api/v1/repos/fixture/app/issues/13/comments", method: "POST" },
  ]);
});
test("Forgejo API failures fail the CI step", async (t) => {
  await assert.rejects(
    preview(t, [{ path: "/api/v1/user", status: 401 }]),
    /Forgejo GET user: 401/,
  );
});
