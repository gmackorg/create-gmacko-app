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
import type {
  ExplorationResult,
  FaultPoint,
  RunResult,
  Scenario,
} from "./cloudfault";
import {
  createFailureArtifact,
  exploreScenarios,
  renderFailureArtifact,
} from "./cloudfault";

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
  // SAFETY: vitest.fault.config.ts declares CLOUDFAULT_DEPTH as a Miniflare
  // binding for this suite only, so it is absent from the generated `Env`;
  // the value is validated as a number immediately below.
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
  const result = await exploreScenarios(
    scenario.faultPoints,
    scenario.execute,
    {
      maxDepth: scenario.maxDepth ?? searchDepth(),
      stopOnFirstFailure: true,
      minimizeFailure: true,
    },
  );
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

/**
 * Fails unless every declared perturbation activated in at least one run.
 *
 * A fault whose selector matches nothing is invisible: the search still runs,
 * every invariant still holds, and the lane reports success while testing
 * nothing. That is the single most likely way for this lane to lie, so it is
 * asserted rather than trusted.
 */
export const assertActivated = (
  result: ExplorationResult<unknown>,
  faultPoints: readonly FaultPoint[],
): void => {
  const fired = new Set<string>();
  for (const run of [result.baseline, ...result.runs]) {
    for (const event of run?.history ?? []) {
      if (event.type !== "fault" && event.type !== "semantic") continue;
      // SAFETY: CloudFault's `History.perturb` stores the `Perturbation`
      // record itself as the value of a `fault`/`semantic` event, and every
      // Perturbation has a string `id`.
      fired.add((event.value as Perturbation).id);
    }
  }
  const silent = faultPoints
    .flatMap((point) => point.choices)
    .map((choice) => choice.id)
    .filter((id) => !fired.has(id));
  if (silent.length > 0) {
    throw new Error(
      `CloudFault perturbations never activated: ${silent.join(", ")}.\n` +
        "Their selector matches no operation the workload performs, so the " +
        "green result above proves nothing. Check target/operation names " +
        "against the history the proxy records.",
    );
  }
};

/** The perturbation ids of a run's minimal failure set, for assertions. */
export const minimalFailureSetIds = (
  result: ExplorationResult<unknown>,
): ReadonlyArray<string> =>
  (result.minimalFailureSet ?? []).map((item) => item.id);
