/**
 * The lane's single import surface for CloudFault.
 *
 * Every `@gmacko/cloudfault` specifier in the repo lives here, so the day the
 * package moves (a new subpath, a rename, a different install strategy) one
 * file changes instead of every scenario.
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
export { stripeWebhookSigner } from "@gmacko/cloudfault/adapter-sdk/signers";
export type {
  D1DatabaseLike,
  R2BucketLike,
} from "@gmacko/cloudfault/cloudflare";
export {
  createD1FaultProxy,
  createR2FaultProxy,
  D1IndeterminateError,
  D1InjectedError,
  d1CommitThenTimeout,
  d1TransientNetworkError,
  R2IndeterminateError,
  R2InjectedError,
  r2CapacityError,
  r2CommitThenTimeout,
} from "@gmacko/cloudfault/cloudflare";

// The R2 surface stops there on purpose. `@gmacko/cloudfault` is pinned to
// ^0.1.0, whose R2 module ships exactly these two faults; the multipart ones
// (`r2MultipartCommitThenTimeout`, `r2PartUploadError`,
// `r2PartialMultipartCompletion`) arrive in 0.2.0, which is not published.
// Re-exporting a name this version does not have would fail at import, so the
// multipart path in `@gmacko/storage.putLarge` has no scenario yet.
