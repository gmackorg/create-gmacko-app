import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { STATE_DIR } from "./helpers/env";

/** Stops the emulated GitHub started by global-setup. */
export default function globalTeardown(): void {
  const pidFile = resolve(STATE_DIR, "emulate.pid");
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, "utf8"));
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
  rmSync(pidFile, { force: true });
}
