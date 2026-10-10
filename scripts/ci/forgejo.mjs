import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";

const server = process.env.FORGEJO_SERVER_URL;
const repository = process.env.FORGEJO_REPOSITORY;
const token = process.env.FORGEJO_TOKEN;
if (!server || !repository || !token)
  throw new Error("Forgejo server, repository, and token are required");
const base = new URL(server);
if (base.hostname !== "git.forgegraf.com")
  throw new Error("CI must target the Forgejo server");
async function api(path, method = "GET", body) {
  const multipart = body instanceof FormData;
  const headers = { Authorization: `token ${token}` };
  if (!multipart) headers["Content-Type"] = "application/json";
  const response = await fetch(new URL(`/api/v1/${path}`, base), {
    method,
    headers,
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Forgejo ${method} ${path}: ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}
const repoPath = `repos/${repository}`;
const command = process.argv[2];
if (command === "preview") {
  const issue = process.env.FORGEJO_PR_NUMBER;
  if (!/^\d+$/.test(issue || "")) throw new Error("PR number is required");
  const url = process.env.PREVIEW_URL;
  const body = `## Preview deploy\n\nWorker: gmacko-web-preview\nVersion: ${process.env.VERSION_ID || "(unknown)"}\nURL: ${url || "(preview URLs not enabled)"}\nCommit: ${(process.env.FORGEJO_HEAD_SHA || "").slice(0, 7)}\nDatabase: shared gmacko-web-preview D1\nHealth: ${url ? `${url}/.well-known/forge-health` : "n/a"}\n`;
  const user = await api("user");
  let existing;
  for (let page = 1; ; page++) {
    const comments = await api(
      `${repoPath}/issues/${issue}/comments?limit=50&page=${page}`,
    );
    existing = comments.find(
      (c) => c.user.id === user.id && c.body.startsWith("## Preview deploy\n"),
    );
    if (existing || comments.length < 50) break;
  }
  await api(
    existing
      ? `${repoPath}/issues/comments/${existing.id}`
      : `${repoPath}/issues/${issue}/comments`,
    existing ? "PATCH" : "POST",
    { body },
  );
} else if (command === "release-assets") {
  const tag = process.env.FORGEJO_RELEASE_TAG;
  if (!tag) throw new Error("Release tag is required");
  const release = await api(
    `${repoPath}/releases/tags/${encodeURIComponent(tag)}`,
  );
  const existing = await api(`${repoPath}/releases/${release.id}/assets`);
  for (const entry of await readdir("sdks/generated", {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const dir = entry.name;
    const file = `sdks/generated/${dir}/README.md`;
    let content;
    try {
      content = await readFile(file);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const name = `${dir}-README.md`;
    if (existing.some((asset) => asset.name === name)) continue;
    const form = new FormData();
    form.append("attachment", new Blob([content]), name);
    await api(`${repoPath}/releases/${release.id}/assets`, "POST", form);
  }
} else if (command === "release") {
  const pending = (await readdir(".changeset")).filter(
    (name) => name.endsWith(".md") && name !== "README.md",
  );
  if (pending.length === 0) {
    execFileSync("pnpm", ["release"], { stdio: "inherit" });
  } else {
    const branch = "changeset-release/main";
    execFileSync("git", ["checkout", "-B", branch], { stdio: "inherit" });
    execFileSync("pnpm", ["version-packages"], { stdio: "inherit" });
    execFileSync("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], {
      stdio: "inherit",
    });
    execFileSync("git", ["config", "user.name", "Forgejo release bot"]);
    execFileSync("git", ["config", "user.email", "release-bot@forgegraf.com"]);
    execFileSync("git", ["add", "."]);
    execFileSync("git", ["commit", "-m", "chore: version packages"], {
      stdio: "inherit",
    });
    const remote = execFileSync(
      "git",
      ["ls-remote", "--heads", "origin", branch],
      { encoding: "utf8" },
    ).trim();
    const expected = remote ? remote.split(/\s+/)[0] : "";
    execFileSync(
      "git",
      [
        "push",
        `--force-with-lease=refs/heads/${branch}:${expected}`,
        "origin",
        `HEAD:refs/heads/${branch}`,
      ],
      { stdio: "inherit" },
    );
    const pulls = await api(`${repoPath}/pulls?state=open&limit=100`);
    if (!pulls.some((pr) => pr.head.ref === branch)) {
      await api(`${repoPath}/pulls`, "POST", {
        base: "main",
        head: branch,
        title: "chore: version packages",
        body: "Version packages prepared by Forgejo CI.",
      });
    }
  }
} else throw new Error(`Unknown Forgejo CI command: ${command}`);
