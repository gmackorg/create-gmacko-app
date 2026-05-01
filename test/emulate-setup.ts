import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = resolve(ROOT, "node_modules/.cache/.emulate-lock");

let proc: ChildProcess | null = null;
let ownsLock = false;

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Port ${port} not ready after ${timeoutMs}ms`);
}

function tryAcquireLock(): boolean {
  mkdirSync(resolve(ROOT, "node_modules/.cache"), { recursive: true });
  try {
    writeFileSync(LOCK, String(process.pid), { flag: "wx" });
    ownsLock = true;
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  if (ownsLock) {
    try {
      unlinkSync(LOCK);
    } catch {}
    ownsLock = false;
  }
}

export async function setup() {
  if (await isPortOpen(4000)) {
    return;
  }

  if (!tryAcquireLock()) {
    await waitForPort(4000);
    return;
  }

  const services = ["github", "google", "apple", "stripe", "resend"];
  if (!(await isPortOpen(5432))) {
    services.push("postgres");
  }

  proc = spawn(
    "npx",
    [
      "@gmacko/emulate",
      "start",
      "-s",
      services.join(","),
      "--seed",
      "emulate.config.yaml",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: ROOT,
    },
  );

  proc.on("error", () => {});
  proc.on("exit", () => {
    proc = null;
  });

  try {
    await waitForPort(4000);
  } catch (err) {
    releaseLock();
    throw err;
  }
}

export async function teardown() {
  if (proc) {
    proc.kill("SIGTERM");
    proc = null;
  }
  releaseLock();
}
