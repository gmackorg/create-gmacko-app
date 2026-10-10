import { type ForgeError } from "./errors.js";
import type { AtomicAbsenceGuard, CommitPlan } from "./services.js";
/** Storage-level defense: no transaction can publish a fact it requires absent. */
export declare function absenceWriteConflict(plans: readonly CommitPlan[], absent: readonly AtomicAbsenceGuard[]): ForgeError | null;
