import { type ArtifactPublicationProvider } from "../artifact-publication.js";
import type { ArtifactReadProvider } from "../versioned-artifacts.js";
export interface GitArtifactPublicationOptions {
    /** Dedicated, trusted bare repository containing prepared commit objects. */
    readonly directory: string;
    /** Repository-scoped HTTPS remote, or absolute local path for local qualification. */
    readonly remote: string;
    /** Stable identity/read capability for the SAME remote. Never caller-selected. */
    readonly identity: ArtifactReadProvider;
    /** Repository-scoped credential; supplied only through child process environment. */
    readonly token?: () => Promise<string>;
}
export declare function gitArtifactPublicationProvider(options: GitArtifactPublicationOptions): ArtifactPublicationProvider;
