/** Source providers resolve discovery selectors; durable pins contain only complete Git object IDs. */
export interface SpecificationPin {
    readonly repository: string;
    readonly anchor: string;
    readonly revision: string;
}
export interface SourceSpan {
    readonly file: string;
    readonly start: number;
    readonly end: number;
}
export interface PinnedSourceMap {
    readonly version: "forge-source-map/1";
    readonly revision: string;
    readonly anchors: Readonly<Record<string, SourceSpan>>;
}
export interface SpecificationProvider {
    resolveSelector(request: {
        repository: string;
        anchor: string;
        selector: string;
    }): Promise<SpecificationPin>;
    sourceMap(pin: SpecificationPin): Promise<{
        repository: string;
        map: PinnedSourceMap;
    }>;
}
export declare function validateSpecificationPin(pin: SpecificationPin): void;
export declare function resolveSpecificationSelector(provider: SpecificationProvider, request: {
    repository: string;
    anchor: string;
    selector: string;
}): Promise<SpecificationPin>;
export declare function resolveSpecificationSourceSpan(provider: SpecificationProvider, pin: SpecificationPin): Promise<Readonly<SourceSpan>>;
