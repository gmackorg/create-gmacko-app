// Native runtime for the Preflight crash/error reporter.
//
// This module dual-reports client-side crashes to Preflight ALONGSIDE Sentry —
// it never replaces the Sentry sink. It installs a global JS error handler and
// an unhandled-promise-rejection handler, both of which chain to any previous
// handler so Sentry / the RedBox keep working.
//
// Everything here is defensive: it must never throw into the app or block
// startup. Native modules are loaded via optional `require` so the reporter
// degrades gracefully when a module isn't installed. The pure, testable event
// building lives in `./preflight-core`.

import { integrations } from "@gmacko/config";

import {
  BreadcrumbBuffer,
  buildErrorEvent,
  generateEventId,
  PREFLIGHT_DEFAULT_INGEST_URL,
  PREFLIGHT_SDK_NAME,
  PREFLIGHT_SDK_VERSION,
  type PreflightBreadcrumb,
  type PreflightContext,
  type PreflightDeviceContext,
  type PreflightErrorEvent,
  type PreflightLevel,
  preflightIngestUrl,
} from "./preflight-core";

export type {
  BuildErrorEventMeta,
  PreflightBreadcrumb,
  PreflightContext,
  PreflightContextValue,
  PreflightDeviceContext,
  PreflightErrorEvent,
  PreflightLevel,
  PreflightPlatform,
  PreflightSdkInfo,
  PreflightStackFrame,
} from "./preflight-core";
export {
  BreadcrumbBuffer,
  buildErrorEvent,
  generateEventId,
  PREFLIGHT_DEFAULT_INGEST_URL,
  PREFLIGHT_SDK_NAME,
  PREFLIGHT_SDK_VERSION,
  parseStack,
  preflightIngestUrl,
} from "./preflight-core";

// Metro provides `require` at runtime; declare it for `tsc` since this native
// entry is never type-checked against @types/node. It answers whatever the
// module exports; `optionalRequire` is the one caller and names the shape.
// oxlint-disable-next-line anti-slop/no-unknown-returns
declare const require: ((moduleId: string) => unknown) | undefined;

export interface PreflightNativeConfig {
  /** Preflight app id (e.g. from EXPO_PUBLIC_PREFLIGHT_APP_ID). */
  appId: string;
  /** Per-install write-only ingest key, `pfik_<hex>`. */
  ingestKey: string;
  /** Ingest host. Defaults to https://preflight.forgegraph.com. */
  ingestUrl?: string;
  environment?: string;
  /** Override release string (defaults to appVersion+build from the binary). */
  release?: string;
  /** Override app version (defaults to nativeApplicationVersion). */
  appVersion?: string;
  debug?: boolean;
  /** Breadcrumb ring-buffer size. Defaults to 30. */
  maxBreadcrumbs?: number;
}

interface ResolvedConfig {
  appId: string;
  ingestKey: string;
  ingestUrl: string;
  environment?: string;
  release?: string;
  appVersion?: string;
  debug: boolean;
}

interface RNPlatform {
  OS?: string;
}

/** React Native's global JS error handler: called with whatever was thrown. */
type RNGlobalErrorHandler = (cause: unknown, isFatal?: boolean) => void;

interface RNErrorUtils {
  getGlobalHandler?: () => RNGlobalErrorHandler | undefined;
  setGlobalHandler?: (handler: RNGlobalErrorHandler) => void;
}

interface ExpoDeviceModule {
  osName?: string | null;
  osVersion?: string | null;
  modelName?: string | null;
}

interface ExpoApplicationModule {
  nativeApplicationVersion?: string | null;
  nativeBuildVersion?: string | null;
}

interface AsyncStorageLike {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

/** The module as shipped: the store itself, or an ESM wrapper around it. */
interface AsyncStorageModule {
  default?: AsyncStorageModule;
  getItem?: AsyncStorageLike["getItem"];
  setItem?: AsyncStorageLike["setItem"];
}

/** RN's promise rejection tracker (`promise/setimmediate/rejection-tracking`). */
interface RejectionTrackingModule {
  enable?: (options: {
    allRejections?: boolean;
    onUnhandled?: (id: number, cause: unknown) => void;
    onHandled?: (id: number) => void;
  }) => void;
}

/** The DOM-style `unhandledrejection` event some RN/Hermes setups dispatch. */
interface UnhandledRejectionEvent {
  reason?: unknown;
}
interface GlobalWithRejectionEvents {
  addEventListener?: (
    type: "unhandledrejection",
    listener: (event: UnhandledRejectionEvent) => void,
  ) => void;
}

interface FileSystemLike {
  documentDirectory?: string | null;
  readAsStringAsync: (uri: string) => Promise<string>;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
}

const QUEUE_STORAGE_KEY = "preflight.error-queue.v1";
const MAX_QUEUE_SIZE = 50;

// Module-level reporter state.
let initialized = false;
let config: ResolvedConfig | null = null;
let deviceContext: PreflightDeviceContext | null = null;
let breadcrumbs = new BreadcrumbBuffer();
let flushing = false;
const sessionId = generateEventId();

// In-memory fallback store used when no persistent native storage is available
// (keeps the reporter working, just non-durable across launches).
const memoryStore = new Map<string, string>();

function safeWarn(
  debug: boolean | undefined,
  message: string,
  cause?: unknown,
) {
  if (debug) {
    // oxlint-disable-next-line no-console -- the reporter's own debug channel; it must never depend on the logger it reports for
    console.warn(`[preflight] ${message}`, cause);
  }
}

/**
 * A native module by id, or `null` when it is not in this build. `T` is the
 * module's shape as this file reads it; every caller declares one whose
 * fields are all optional, so an unexpected export shape reads as "absent"
 * rather than misbehaving.
 */
function optionalRequire<T extends object>(moduleId: string): T | null {
  try {
    const exports = require?.(moduleId);
    if (exports === undefined || exports === null) return null;
    // SAFETY: `moduleId` is one of the native modules named in this file
    // (react-native, expo-device, expo-application, expo-file-system, the
    // async-storage and rejection-tracking packages), and `T` is the
    // all-optional interface above that describes what this file reads off
    // it. A missing module is caught below and answered `null`.
    return exports as T;
  } catch {
    // Module not installed / not resolvable in this build — degrade gracefully.
  }
  return null;
}

function getReactNativePlatform(): RNPlatform | null {
  const rn = optionalRequire<{ Platform?: RNPlatform }>("react-native");
  return rn?.Platform ?? null;
}

function getErrorUtils(): RNErrorUtils | null {
  // SAFETY: React Native installs `ErrorUtils` on the global object; the
  // interface is all-optional, so a runtime without it (or with a different
  // shape) reads as "no handler to chain" rather than a wrong call.
  const globalWithErrorUtils = globalThis as { ErrorUtils?: RNErrorUtils };
  return globalWithErrorUtils.ErrorUtils ?? null;
}

function getAsyncStorage(): AsyncStorageLike | null {
  const mod = optionalRequire<AsyncStorageModule>(
    "@react-native-async-storage/async-storage",
  );
  if (!mod) return null;
  const candidate = mod.default ?? mod;
  const { getItem, setItem } = candidate;
  if (!getItem || !setItem) return null;
  return {
    getItem: (key) => getItem.call(candidate, key),
    setItem: (key, value) => setItem.call(candidate, key, value),
  };
}

function getFileSystem(): FileSystemLike | null {
  const mod = optionalRequire<Partial<FileSystemLike>>("expo-file-system");
  if (!mod?.writeAsStringAsync || !mod.readAsStringAsync || !mod.getInfoAsync) {
    return null;
  }
  return {
    documentDirectory: mod.documentDirectory,
    readAsStringAsync: mod.readAsStringAsync,
    writeAsStringAsync: mod.writeAsStringAsync,
    getInfoAsync: mod.getInfoAsync,
  };
}

function fileUriForKey(fs: FileSystemLike, key: string): string | null {
  if (!fs.documentDirectory) return null;
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${fs.documentDirectory}${safe}.json`;
}

async function storageGet(key: string): Promise<string | null> {
  const asyncStorage = getAsyncStorage();
  if (asyncStorage) {
    try {
      return (await asyncStorage.getItem(key)) ?? null;
    } catch {
      return null;
    }
  }
  const fs = getFileSystem();
  if (fs) {
    const uri = fileUriForKey(fs, key);
    if (uri) {
      try {
        const info = await fs.getInfoAsync(uri);
        if (!info.exists) return null;
        return await fs.readAsStringAsync(uri);
      } catch {
        return null;
      }
    }
  }
  return memoryStore.get(key) ?? null;
}

async function storageSet(key: string, value: string): Promise<void> {
  const asyncStorage = getAsyncStorage();
  if (asyncStorage) {
    try {
      await asyncStorage.setItem(key, value);
      return;
    } catch {
      // fall through to other stores
    }
  }
  const fs = getFileSystem();
  if (fs) {
    const uri = fileUriForKey(fs, key);
    if (uri) {
      try {
        await fs.writeAsStringAsync(uri, value);
        return;
      } catch {
        // fall through to memory store
      }
    }
  }
  memoryStore.set(key, value);
}

async function readQueue(): Promise<PreflightErrorEvent[]> {
  const raw = await storageGet(QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // SAFETY: the queue under `QUEUE_STORAGE_KEY` is written only by
    // `writeQueue` from `PreflightErrorEvent`s, so an array read back from
    // it is one; a store that fails to parse at all is answered `[]` below,
    // and the ingest validates every event it receives.
    return parsed as PreflightErrorEvent[];
  } catch {
    return [];
  }
}

async function writeQueue(events: PreflightErrorEvent[]): Promise<void> {
  const capped =
    events.length > MAX_QUEUE_SIZE ? events.slice(-MAX_QUEUE_SIZE) : events;
  await storageSet(QUEUE_STORAGE_KEY, JSON.stringify(capped));
}

async function persistEvent(event: PreflightErrorEvent): Promise<void> {
  const queue = await readQueue();
  queue.push(event);
  await writeQueue(queue);
}

async function sendEvents(events: PreflightErrorEvent[]): Promise<boolean> {
  if (!config || events.length === 0) return true;
  try {
    const url = preflightIngestUrl(config.ingestUrl, config.appId);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-preflight-ingest-key": config.ingestKey,
      },
      body: JSON.stringify({ events }),
    });
    return response.ok;
  } catch (cause) {
    // Network failure — leave the events queued for the next flush.
    safeWarn(config?.debug, "send failed", cause);
    return false;
  }
}

/**
 * Send everything currently queued. On success, only the sent ids are removed
 * (so events enqueued mid-flush aren't dropped). On failure, events stay queued
 * for the next launch/flush.
 */
async function flushQueue(): Promise<void> {
  if (flushing || !config) return;
  flushing = true;
  try {
    const queued = await readQueue();
    if (queued.length === 0) return;
    const ok = await sendEvents(queued);
    if (ok) {
      const sentIds = new Set(
        queued.map((event) => event.providerEventId).filter(Boolean),
      );
      const remaining = (await readQueue()).filter(
        (event) => !sentIds.has(event.providerEventId),
      );
      await writeQueue(remaining);
    }
  } catch (cause) {
    safeWarn(config?.debug, "flush failed", cause);
  } finally {
    flushing = false;
  }
}

function gatherDeviceContext(resolved: ResolvedConfig): PreflightDeviceContext {
  const platformOs = getReactNativePlatform()?.OS;
  const platform =
    platformOs === "ios" || platformOs === "android" ? platformOs : undefined;

  const device = optionalRequire<ExpoDeviceModule>("expo-device");
  const application =
    optionalRequire<ExpoApplicationModule>("expo-application");

  const appVersion =
    resolved.appVersion ?? application?.nativeApplicationVersion ?? undefined;
  const build = application?.nativeBuildVersion ?? undefined;
  const release =
    resolved.release ??
    (appVersion ? (build ? `${appVersion}+${build}` : appVersion) : undefined);

  return {
    platform,
    appVersion: appVersion ?? undefined,
    release,
    osName: device?.osName ?? undefined,
    osVersion: device?.osVersion ?? undefined,
    deviceModel: device?.modelName ?? undefined,
    sessionId,
    sdk: { name: PREFLIGHT_SDK_NAME, version: PREFLIGHT_SDK_VERSION },
  };
}

function installGlobalHandler(): void {
  const errorUtils = getErrorUtils();
  if (!errorUtils?.setGlobalHandler) return;
  const previous = errorUtils.getGlobalHandler?.();
  const handler: RNGlobalErrorHandler = (cause, isFatal) => {
    try {
      capturePreflightException(cause, { isFatal: Boolean(isFatal) });
    } catch {
      // never let the reporter break crash handling
    }
    // Chain to the previous handler so Sentry / the RedBox still fire.
    previous?.(cause, isFatal);
  };
  errorUtils.setGlobalHandler(handler);
}

function installRejectionHandler(): void {
  // Preferred: RN's promise rejection tracker.
  const tracking = optionalRequire<RejectionTrackingModule>(
    "promise/setimmediate/rejection-tracking",
  );
  if (tracking?.enable) {
    try {
      tracking.enable({
        allRejections: true,
        onUnhandled: (_id, cause) => {
          capturePreflightException(cause, {
            isFatal: false,
            level: "error",
            context: { unhandledRejection: true },
          });
        },
        onHandled: () => {},
      });
      return;
    } catch (cause) {
      safeWarn(config?.debug, "rejection-tracking enable failed", cause);
    }
  }

  // Fallback: the DOM-style global event, present on some RN/Hermes setups.
  // SAFETY: the interface is all-optional; a global without
  // `addEventListener` reads as "no event to subscribe to".
  const globalWithEvents = globalThis as GlobalWithRejectionEvents;
  if (globalWithEvents.addEventListener) {
    try {
      globalWithEvents.addEventListener("unhandledrejection", (event) => {
        capturePreflightException(event.reason, {
          isFatal: false,
          level: "error",
          context: { unhandledRejection: true },
        });
      });
    } catch (cause) {
      safeWarn(config?.debug, "unhandledrejection listener failed", cause);
    }
  }
}

/**
 * Initialize the Preflight native reporter. Installs the global JS error and
 * unhandled-rejection handlers (chaining to Sentry's), gathers device context
 * once, starts a breadcrumb buffer, and flushes any events persisted from a
 * previous (possibly crashed) launch.
 *
 * No-ops when the `preflight` integration is disabled or appId/key are missing.
 * Never throws.
 */
export function initPreflightNative(cfg: PreflightNativeConfig): void {
  try {
    if (!integrations.preflight) return;
    if (!cfg?.appId || !cfg?.ingestKey) {
      safeWarn(cfg?.debug, "disabled: missing appId or ingestKey");
      return;
    }
    if (initialized) return;
    initialized = true;

    config = {
      appId: cfg.appId,
      ingestKey: cfg.ingestKey,
      ingestUrl: cfg.ingestUrl ?? PREFLIGHT_DEFAULT_INGEST_URL,
      environment: cfg.environment,
      release: cfg.release,
      appVersion: cfg.appVersion,
      debug: cfg.debug ?? false,
    };
    breadcrumbs = new BreadcrumbBuffer(cfg.maxBreadcrumbs ?? 30);
    deviceContext = gatherDeviceContext(config);

    installGlobalHandler();
    installRejectionHandler();

    // Ship anything left over from a previous launch (e.g. a fatal crash).
    void flushQueue();
  } catch (cause) {
    safeWarn(cfg?.debug, "init failed", cause);
  }
}

/** Per-capture options: severity and what to attach. */
export interface CapturePreflightOptions {
  isFatal?: boolean;
  level?: PreflightLevel;
  context?: PreflightContext;
}

/**
 * Capture an exception to Preflight: `cause` is whatever was thrown or
 * rejected with (the reporter's I/O boundary; `buildErrorEvent` decodes it).
 * Builds the wire event, persists it (so a fatal crash still ships it on the
 * next launch), then attempts to send. Safe to call before init (no-ops).
 * Never throws.
 */
export function capturePreflightException(
  cause: unknown,
  options: CapturePreflightOptions = {},
): void {
  try {
    if (!integrations.preflight || !config) return;
    const ctx: PreflightDeviceContext = deviceContext ?? {
      sessionId,
      sdk: { name: PREFLIGHT_SDK_NAME, version: PREFLIGHT_SDK_VERSION },
    };
    const event = buildErrorEvent(
      cause,
      {
        isFatal: options.isFatal,
        level: options.level,
        context: options.context,
        breadcrumbs: breadcrumbs.snapshot(),
      },
      ctx,
    );
    // Persist first, then flush. A fatal crash may kill the app before the POST
    // resolves; persisting first guarantees it ships next launch.
    void persistEvent(event)
      .catch(() => {})
      .then(() => flushQueue());
  } catch (cause) {
    safeWarn(config?.debug, "capture failed", cause);
  }
}

/** Add a breadcrumb to the ring buffer attached to future events. Never throws. */
export function addPreflightBreadcrumb(breadcrumb: PreflightBreadcrumb): void {
  try {
    if (!integrations.preflight) return;
    breadcrumbs.add(breadcrumb);
  } catch {
    // ignore
  }
}
