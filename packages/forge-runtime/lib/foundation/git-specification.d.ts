import { type SpecificationPin, type SpecificationProvider, type PinnedSourceMap } from "./specification.js";
export interface GitSpecificationRepository {
    directory: string;
    sourceMap: string;
}
export declare class GitSpecificationProvider implements SpecificationProvider {
    private readonly repositories;
    constructor(repositories: Readonly<Record<string, GitSpecificationRepository>>);
    private config;
    private git;
    private blob;
    resolveSelector(request: {
        repository: string;
        anchor: string;
        selector: string;
    }): Promise<SpecificationPin>;
    sourceMap(pin: SpecificationPin): Promise<{
        repository: string;
        map: PinnedSourceMap;
    }>;
    /** Dependency closure is read from the pinned tree, never the working directory. */
    lockfile(pin: SpecificationPin): Promise<string>;
}
