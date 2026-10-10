import { Effect } from "effect";
import { type Wire } from "./decode.js";
import { type ForgeError } from "./errors.js";
import type { Model, TypeSpec } from "./model.js";
import type { StorageAdapter } from "./services.js";
export interface ActorDefinition {
    id: string;
    state: TypeSpec;
    messages: Record<string, TypeSpec>;
}
export interface ActorAlarm {
    name: string;
    at: number;
    command: string;
    payload: Wire;
    occurrence: string;
}
export interface ActorEffect {
    id: string;
    kind: string;
    payload: Wire;
}
export interface ActorState {
    definitionDigest: string;
    state: Wire;
    generation: number;
    revision: number;
    receipts: {
        id: string;
        command: string;
        payload: string;
        revision: number;
    }[];
    effects: ActorEffect[];
    alarms: ActorAlarm[];
}
export interface ActorTransition {
    state: Wire;
    effects?: {
        kind: string;
        payload: Wire;
    }[];
    alarms?: {
        name: string;
        at: number;
        command: string;
        payload: Wire;
    }[];
}
export type ActorReducer = (state: Readonly<Wire>, message: Readonly<Wire>) => ActorTransition;
export type ActorStore = Pick<StorageAdapter, "getDocument" | "putDocument">;
export declare class ActorHost {
    private readonly model;
    private readonly storage;
    readonly definition: ActorDefinition;
    private readonly reducers;
    private readonly now;
    constructor(model: Model, storage: ActorStore, definition: ActorDefinition, reducers: Record<string, ActorReducer>, now?: () => number);
    private key;
    private change;
    initialize(tenant: string, key: string, state: Wire): Effect.Effect<ActorState, ForgeError, never>;
    takeover(tenant: string, key: string, expectedGeneration: number): Effect.Effect<number, ForgeError, never>;
    command(tenant: string, key: string, messageId: string, command: string, payload: Wire, generation: number, alarmOccurrence?: string): Effect.Effect<{
        revision: number;
        duplicate: boolean;
    }, ForgeError, never>;
    load(tenant: string, key: string): Effect.Effect<ActorState, ForgeError>;
    fireDue(tenant: string, key: string, generation: number): Effect.Effect<number, ForgeError>;
    acknowledgeEffect(tenant: string, key: string, id: string, generation: number): Effect.Effect<undefined, ForgeError, never>;
}
/** Minimal Durable Object transaction facade; accepts the real DO storage object. */
export interface DurableActorStorage {
    setAlarm(at: number): Promise<void>;
    deleteAlarm(): Promise<void>;
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    transaction<T>(body: (tx: DurableActorStorage) => Promise<T>): Promise<T>;
}
export declare class DurableObjectActorStore implements ActorStore {
    private readonly storage;
    constructor(storage: DurableActorStorage);
    getDocument(tenant: string, kind: string, id: string): Effect.Effect<Wire | null, ForgeError>;
    putDocument(tenant: string, kind: string, id: string, doc: Wire, expectedVersion: number | null): Effect.Effect<void, ForgeError>;
}
/** Bind this wrapper to one Durable Object identity. The host authenticates the
 * tenant/key and commands before calling it; alarm() is the DO alarm entrypoint. */
export declare class DurableActorSession {
    private readonly storage;
    private readonly tenant;
    private readonly key;
    readonly host: ActorHost;
    constructor(model: Model, storage: DurableActorStorage & {
        setAlarm(at: number): Promise<void>;
        deleteAlarm(): Promise<void>;
    }, definition: ActorDefinition, reducers: Record<string, ActorReducer>, tenant: string, key: string);
    initialize(state: Wire): Promise<ActorState>;
    command(messageId: string, command: string, payload: Wire, generation: number): Promise<{
        revision: number;
        duplicate: boolean;
    }>;
    alarm(): Promise<number>;
}
