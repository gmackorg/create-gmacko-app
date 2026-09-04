/**
 * The lane's search driver: one place that turns a scenario definition into a
 * bounded systematic exploration, and turns a failure into the report a
 * reader can act on (checks, minimal failure set, timeline).
 *
 * Depth is `CLOUDFAULT_DEPTH` (a Miniflare binding set from the environment in
 * vitest.fault.config.ts), so the same scenario file serves the depth-1 pass
 * every PR runs and the deeper scheduled run. Depth 1 asks "which single
 * perturbation breaks this?"; depth 2 asks "which *pair* breaks this while
 * neither alone does?" — the combination bugs unit tests never reach.
 */
import { env } from "cloudflare:workers";

import {
  createFailureArtifact,
  exploreScenarios,
  renderFailureArtifact,
} from "./cloudfault";
import type { ExplorationResult, FaultPoint, RunResult, Scenario } from "./cloudfault";

export interface FaultScenario<State> {
  /** Stable name; it heads the failure report. */
  readonly name: string;
  readonly faultPoints: readonly FaultPoint[];
  /** Runs the workload once under `scenario` and checks the invariants. */
  readonly execute: (scenario: Scenario) => Promise<RunResult<State>>;
  /** Overrides `CLOUDFAULT_DEPTH` for a scenario that must stay cheap. */
  readonly maxDepth?: number;
}

/** `CLOUDFAULT_DEPTH`, clamped to something a CI job can finish. */
export const searchDepth = (): number => {
  const raw = Number((env as { CLOUDFAULT_DEPTH?: string }).CLOUDFAULT_DEPTH);
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.trunc(raw), 4) : 1;
};

/**
 * Explores `scenario` and throws a rendered failure report if any run breaks
 * an invariant. The thrown message is the whole artifact — checks, the
 * minimal failure set, and the history timeline — because a fault-injection
 * failure is unreadable without it: the assertion tells you *that* an
 * invariant broke, the MFS tells you *what you have to fix*.
 */
export const explore = async <State>(
  scenario: FaultScenario<State>,
): Promise<ExplorationResult<State>> => {
  const result = await exploreScenarios(scenario.faultPoints, scenario.execute, {
    maxDepth: scenario.maxDepth ?? searchDepth(),
    stopOnFirstFailure: true,
    minimizeFailure: true,
  });
  if (result.firstFailure) {
    const artifact = createFailureArtifact({
      testName: scenario.name,
      run: result.firstFailure,
      minimalFailureSet: result.minimalFailureSet,
    });
    throw new Error(`\n${renderFailureArtifact(artifact)}\n`);
  }
  return result;
};

/** The perturbation ids of a run's minimal failure set, for assertions. */
export const minimalFailureSetIds = (
  result: ExplorationResult<unknown>,
): ReadonlyArray<string> =>
  (result.minimalFailureSet ?? []).map((item) => item.id);
