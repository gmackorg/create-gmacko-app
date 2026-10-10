/**
 * Typed view over the compiled app bundle (`forgec build` output). The runtime
 * interprets this model; it never re-derives semantics from source.
 */
export interface TypeSpec {
    base: TypeBase;
    optional: boolean;
    normalizers: string[];
    constraints: Constraint[];
}
export type TypeBase = {
    kind: "collection";
    collection: "list" | "set" | "map";
    element: TypeSpec;
} | {
    kind: "scalar";
    name: string;
    args: string[];
} | {
    kind: "enum";
    id: string;
} | {
    kind: "shape";
    id: string;
} | {
    kind: "reference";
    resource: string;
} | {
    kind: "record";
    resource: string;
} | {
    kind: "identity";
    resource: string;
} | {
    kind: "status";
    resource: string;
} | {
    kind: "message";
    channel: string;
    message: string;
};
export type Constraint = {
    kind: "length";
    min?: number;
    max?: number;
} | {
    kind: "compare";
    op: string;
    value: Literal;
} | {
    kind: "pattern";
    value: string;
};
export type Literal = {
    type: "int";
    value: string;
} | {
    type: "decimal";
    value: string;
} | {
    type: "string";
    value: string;
} | {
    type: "bool";
    value: boolean;
} | {
    type: "null";
} | {
    type: "duration";
    value: string;
} | {
    type: "percent";
    value: string;
} | {
    type: "enumMember";
    value: {
        enum: string;
        member: string;
    };
};
export type Expr = {
    kind: "binary";
    op: string;
    lhs: Expr;
    rhs: Expr;
} | {
    kind: "unary";
    op: string;
    operand: Expr;
} | {
    kind: "name";
    path: string[];
} | {
    kind: "literal";
    literal: Literal;
} | {
    kind: "call";
    callee: string[];
    args: Expr[];
};
export interface Field {
    secret?: boolean;
    sequence?: {
        partition: string | null;
        start: number;
        max: number;
    };
    name: string;
    type: TypeSpec;
    default?: Literal;
    derived?: Expr;
    immutable: boolean;
    serverOwned: boolean;
    synthesized: boolean;
    hidden?: boolean;
}
export interface Unique {
    name: string;
    fields: string[];
    within: string[];
    condition?: {
        field: string;
        values: string[];
    };
}
export interface Find {
    name: string;
    fields: string[];
    coveredBy: string;
}
export interface OrderKey {
    field: string;
    direction: string;
}
export interface List {
    searchMode?: "exact";
    name: string;
    fields: string[];
    order: OrderKey[];
}
export interface Transition {
    action: string;
    from: string[];
    to: string;
    input: Field[];
}
export interface Lifecycle {
    field: string;
    enumId: string;
    states: string[];
    initial: string;
    terminals: string[];
    transitions: Transition[];
}
export interface HttpBinding {
    method: string;
    path: string;
}
export interface Operation {
    id: string;
    kind: string;
    query?: string;
    action?: string;
    http?: HttpBinding;
}
export interface ContentPolicy {
    mediaTypes: string[];
    maxBytes: number;
}
export interface Resource {
    id: string;
    name: string;
    kind: "resource" | "blob";
    content?: ContentPolicy;
    decorators: {
        appendOnly?: boolean;
        writeOnce?: boolean;
        tenant: boolean;
        timestamps: boolean;
        softDelete: boolean;
        versioned: boolean;
        audited: boolean;
        hierarchical?: boolean;
        effectiveDated?: {
            uniqueBy: string[];
        };
        crud?: {
            path: string;
            operations?: string[];
            actions: string[];
        };
        purposeScoped?: boolean;
        subject?: {
            binding: "kind";
            kind: string;
        } | {
            binding: "from";
            field: string;
        };
        recordContext?: string;
    };
    fields: Field[];
    uniques: Unique[];
    finds: Find[];
    lists: List[];
    rules: Expr[];
    lifecycle?: Lifecycle;
    operations: Operation[];
}
export interface EnumDecl {
    id: string;
    name: string;
    members: {
        name: string;
        value: string;
    }[];
}
export interface FunctionDecl {
    id: string;
    name: string;
    input?: TypeSpec;
    output?: TypeSpec;
    uses: ({
        kind: "resource";
        resource: string;
        capability: string;
    } | {
        kind: "transition";
        resource: string;
        action: string;
    } | {
        kind: "function";
        function: string;
    })[];
    sends: {
        message: string;
        channel: string;
    }[];
    errors: string[];
    http?: HttpBinding;
    generated: boolean;
}
export interface WebSocketBinding {
    path: string;
}
export interface ChannelDecl {
    id: string;
    name: string;
    contract?: string;
    direction?: string;
    websocket?: WebSocketBinding;
    messages: {
        name: string;
        fields: Field[];
    }[];
}
export interface ViewDecl {
    id: string;
    name: string;
    source: string;
    by: string[];
    where?: Expr;
    order: OrderKey[];
    fields: string[];
}
export interface AggregateDecl {
    function: "count" | "sum" | "min" | "max" | "latest" | "exists" | "notExists";
    field: string;
    alias: string;
    scale?: number;
    filter?: Expr; /** `latest x by t`: ordering field (#198). */
    by?: string;
}
export interface ProjectionDecl {
    id: string;
    name: string;
    source: string;
    by: string[];
    where?: Expr;
    aggregates: AggregateDecl[];
    crud?: {
        path: string;
        operations?: string[];
        actions: string[];
    };
}
export interface CacheDecl {
    id: string;
    name: string;
    keys: Field[];
    loader: Expr;
    freshUntil: Expr;
    staleUntil?: Expr;
}
export type WorkflowTerminal = {
    kind: "return";
    value: Expr;
} | {
    kind: "fail";
    error: string;
};
export type WorkflowStep = {
    kind: "map";
    id: string;
    binding: string;
    source: Expr;
    concurrency: number;
    max_items: number;
    call: Extract<WorkflowStep, {
        kind: "call";
    }>;
} | {
    kind: "call";
    id: string;
    target: {
        kind: "function";
        function: string;
    } | {
        kind: "transition";
        resource: string;
        action: string;
    };
    args: {
        name: string;
        value: Expr;
    }[];
    catches: {
        error: string;
        then: WorkflowTerminal;
    }[];
} | {
    kind: "sleep";
    id: string;
    duration: string;
} | {
    kind: "wait";
    id: string;
    channel: string;
    message: string;
    correlate?: {
        field: string;
        value: Expr;
    };
    timeout?: {
        duration: string;
        then: WorkflowTerminal;
    };
} | {
    kind: "choice";
    id: string;
    condition: Expr;
    then: WorkflowStep[];
    otherwise: WorkflowStep[];
} | {
    kind: "parallel";
    id: string;
    branches: WorkflowStep[][];
} | {
    kind: "return";
    value: Expr;
} | {
    kind: "fail";
    error: string;
};
export interface WorkflowDecl {
    id: string;
    name: string;
    version: number;
    graphHash: string;
    input?: TypeSpec;
    output?: TypeSpec;
    errors: string[];
    http?: HttpBinding;
    steps: WorkflowStep[];
}
export interface SchedulesPlan {
    version: string;
    schedules: {
        source: string;
        name: string;
        target: string;
        cloudflare: {
            cron?: string;
            tick: boolean;
        };
        aws: {
            expression: string;
            timezone: string;
        };
    }[];
    cloudflareCrons: string[];
}
export interface RealtimePlan {
    version: string;
    profile: {
        frame: string;
        maxFrameBytes: number;
        replayDepth: number;
        delivery: string;
        heartbeatSeconds: number;
    };
    streams: {
        channel: string;
        name: string;
        path: string;
        messages: string[];
    }[];
    cloudflare: {
        binding: string;
        className: string;
    };
    aws: {
        apiName: string;
        routes: string[];
    };
}
export interface ObservabilityPlan {
    version: string;
    dimensions: string[];
    classification: Record<string, string>;
    window: string;
    operations: {
        operation: string;
        kind: string;
        resource?: string;
        class: string;
        slo: {
            availability: string;
            latencyGood: string;
            latencyWithinMs: number;
            window: string;
        };
        histogramBoundariesMs: number[];
        businessErrors: string[];
    }[];
}
export interface WorkflowsPlan {
    version: string;
    workflows: {
        id: string;
        name: string;
        version: number;
        graphHash: string;
        cloudflare: {
            name: string;
            binding: string;
            className: string;
        };
        aws: {
            stateMachine: string;
            definition: unknown;
        };
    }[];
}
export interface SourceDecl {
    id: string;
    name: string;
    cron?: string;
    timezone?: string;
    target: string;
}
export interface Module {
    actors?: import("./actors.js").ActorDefinition[];
    workQueues?: (import("./work-queues.js").QueueDefinition & {
        name: string;
        execute: string;
    })[];
    id: string;
    shapes?: {
        id: string;
        fields: Field[];
    }[];
    enums: EnumDecl[];
    resources: Resource[];
    functions: FunctionDecl[];
    channels: ChannelDecl[];
    views?: ViewDecl[];
    projections?: ProjectionDecl[];
    caches?: CacheDecl[];
    workflows?: WorkflowDecl[];
    sources?: SourceDecl[];
    purposes?: PurposeDecl[];
    dataClasses?: DataClassDecl[];
}
export interface MessagingPlan {
    channels: {
        id: string;
        name: string;
        implicit: boolean;
        direction?: string;
        messages: {
            name: string;
        }[];
    }[];
    subscriptions: {
        name: string;
        channel: string;
        message: string;
        handler: string;
        queue: string;
    }[];
    senders: {
        function: string;
        sends: [string, string][];
    }[];
}
export interface PurposeDecl {
    id: string;
    name: string;
    exported: boolean;
    extends?: string;
}
export interface DataClassDecl {
    id: string;
    name: string;
    exported: boolean;
    extends: string;
}
/** Critical IR features this runtime understands; unknown `requires` entries fail closed (plan §4.2). */
export declare const KNOWN_FEATURES: string[];
export declare const DOMAIN_IR_VERSION = "domain-ir/1";
export interface DomainIR {
    version: string;
    package: {
        name: string;
        version: string;
        edition?: string;
        profile?: string;
    };
    modules: Module[];
    requires?: string[];
}
export interface DataSemanticsPlan {
    version: string;
    taxonomy: string;
    fields: {
        resource: string;
        field: string;
        class: string;
        ancestors: string[];
        kinds: string[];
        identifiability: string;
        handling: string;
        personal: string;
        evidence: string;
        completeness: string;
    }[];
    subjects: {
        resource: string;
        kind: string;
        via?: string;
        accessPath?: string;
        recordContext?: string;
    }[];
    summary: Record<string, number>;
}
export interface Contracts {
    version: string;
    resources: {
        id: string;
        name: string;
        wireName: string;
        operations: Operation[];
    }[];
    functions: {
        id: string;
        name: string;
        http?: HttpBinding;
    }[];
}
export interface AppBundle {
    version: string;
    buildHash: string;
    digests?: Record<string, string>;
    openapi?: unknown;
    ir: DomainIR;
    contracts: Contracts;
    sql: unknown;
    dynamo: unknown;
    ui?: unknown;
    messaging?: MessagingPlan;
    workflows?: WorkflowsPlan;
    schedules?: SchedulesPlan;
    realtime?: RealtimePlan;
    observability?: ObservabilityPlan;
    dataSemantics?: DataSemanticsPlan;
    lineage?: unknown;
}
export interface OperationRef {
    op: Operation;
    resource: Resource;
}
export declare class Model {
    readonly bundle: AppBundle;
    readonly resources: Resource[];
    readonly functions: FunctionDecl[];
    readonly channels: ChannelDecl[];
    readonly views: ViewDecl[];
    readonly projections: ProjectionDecl[];
    readonly caches: CacheDecl[];
    readonly workflows: WorkflowDecl[];
    readonly sources: SourceDecl[];
    readonly enums: Map<string, EnumDecl>;
    private readonly byId;
    private readonly ops;
    readonly wireNames: Map<string, string>;
    readonly purposes: PurposeDecl[];
    readonly dataClasses: DataClassDecl[];
    constructor(bundle: AppBundle);
    /** (child resource, field) pairs that reference `resourceId`. */
    dependentsOf(resourceId: string): {
        resource: Resource;
        field: string;
    }[];
    resource(id: string): Resource;
    function(id: string): FunctionDecl | undefined;
    /** Resolve a channel by stable id or local name (declared or implicit `<Resource>.changes`). */
    channel(ref: string): {
        id: string;
        messages: string[];
        direction?: string;
    } | undefined;
    subscription(name: string): {
        name: string;
        channel: string;
        message: string;
        handler: string;
        queue: string;
    } | undefined;
    operation(id: string): OperationRef | undefined;
    wireName(resourceId: string): string;
    /** Operations that carry an HTTP binding, in a stable order. */
    httpOperations(): OperationRef[];
    enumValues(id: string): string[];
}
export declare function fieldOf(r: Resource, name: string): Field | undefined;
/** Scale used for a decimal/money field's minor-unit arithmetic and sort keys. */
export declare function scaleOf(t: TypeSpec): number;
