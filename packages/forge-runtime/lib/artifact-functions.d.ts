/** Compiler-visible external functions; trusted composition supplies providers. */
import type { ExternalBinding } from "./functions.js";
import type { VersionedArtifactReader } from "./versioned-artifacts.js";
import type { ArtifactPublisher } from "./artifact-publication.js";
/** External calls return only typed error codes, never provider messages. The
 * Engine does not decode external dependency inputs, so validate at this boundary. */
export declare function artifactFunctionBindings(services: {
    reader?: VersionedArtifactReader;
    publisher?: ArtifactPublisher;
}): Record<string, ExternalBinding>;
