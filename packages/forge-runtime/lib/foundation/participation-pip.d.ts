import { Effect } from "effect";
import type { Authorizer, AuthzRequest, PipValue } from "../gatekeeper.js";
import type { ForgeError } from "../errors.js";
/** Bridge live participation facts to an independently defined policy. The caller
 * supplies a tenant-scoped Party representation reader (including revocation) and authorized fact reader.
 * Allows are deliberately uncacheable: revocation and time boundaries are checked
 * for every decision, including repeated reads of an unchanged business record. */
export declare function participationPipAuthorizer(base: Authorizer, read: (request: AuthzRequest) => Effect.Effect<PipValue[], ForgeError>): Authorizer;
