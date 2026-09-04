/**
 * The lane's single import surface for CloudFault.
 *
 * Every `@gmacko/cloudfault` specifier in the repo lives here, so the day the
 * package moves (a new subpath, a rename, a different install strategy) one
 * file changes instead of every scenario. `fault/run.mjs` is what makes these
 * specifiers resolve while the package is unpublished.
 */

export type {
  CheckResult,
  ExplorationResult,
  Fault,
  FaultPoint,
  HistoryEvent,
  OperationRef,
  Perturbation,
  RunResult,
  Scenario,
} from "@gmacko/cloudfault";
export {
  checksFailed,
  createFailureArtifact,
  exploreScenarios,
  invariant,
  renderFailureArtifact,
  runCheckers,
  ScenarioController,
} from "@gmacko/cloudfault";
export {
  createD1FaultProxy,
  D1IndeterminateError,
  D1InjectedError,
  d1CommitThenTimeout,
  d1TransientNetworkError,
} from "@gmacko/cloudfault/cloudflare";
