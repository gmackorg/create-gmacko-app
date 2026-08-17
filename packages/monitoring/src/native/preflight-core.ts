// Pure, native-module-free logic for the Preflight crash/error reporter.
//
// Nothing in this file may import `react-native`, `expo-*`, or any other native
// module: everything here must run in a plain Node/vitest environment so the
// stack parser and event builder can be unit-tested without a device. The
// native side (`preflight.ts`) gathers device context and passes it in as a
// plain object.

export type PreflightLevel = "fatal" | "error" | "warning" | "info";

export type PreflightPlatform = "ios" | "android";

/** Default Preflight ingest host; overridable via config/env. */
export const PREFLIGHT_DEFAULT_INGEST_URL = "https://preflight.forgegraph.com";

/** SDK identity reported on every event. */
export const PREFLIGHT_SDK_NAME = "preflight-expo";
export const PREFLIGHT_SDK_VERSION = "0.1.0";

export interface PreflightStackFrame {
  function?: string;
  module?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  inApp?: boolean;
}

export interface PreflightBreadcrumb {
  timestamp?: string;
  category?: string;
  level?: PreflightLevel | string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface PreflightSdkInfo {
  name: string;
  version: string;
}

/**
 * Wire-format error event. All fields optional except `provider` — mirrors the
 * Preflight ingest contract at
 * `POST /api/preflight/v1/apps/:appId/errors`.
 */
export interface PreflightErrorEvent {
  provider: "preflight";
  providerEventId?: string;
  level?: PreflightLevel;
  runtime?: "expo";
  platform?: PreflightPlatform;
  type?: string;
  message?: string;
  stack?: PreflightStackFrame[];
  isFatal?: boolean;
  release?: string;
  appVersion?: string;
  osName?: string;
  osVersion?: string;
  deviceModel?: string;
  sessionId?: string;
  breadcrumbs?: PreflightBreadcrumb[];
  context?: Record<string, unknown>;
  sdk?: PreflightSdkInfo;
  occurredAt?: string;
}

/** Device/app context gathered once at init and reused for every event. */
export interface PreflightDeviceContext {
  platform?: PreflightPlatform;
  release?: string;
  appVersion?: string;
  osName?: string;
  osVersion?: string;
  deviceModel?: string;
  sessionId?: string;
  sdk?: PreflightSdkInfo;
}

/** Per-capture metadata that overrides or augments the event. */
export interface BuildErrorEventMeta {
  isFatal?: boolean;
  level?: PreflightLevel;
  context?: Record<string, unknown>;
  breadcrumbs?: PreflightBreadcrumb[];
  providerEventId?: string;
  occurredAt?: string;
}

/**
 * Build the ingest path for an app. Trims trailing slashes from the base URL
 * and URL-encodes the app id.
 */
export function preflightIngestUrl(baseUrl: string, appId: string): string {
  const trimmed = (baseUrl || PREFLIGHT_DEFAULT_INGEST_URL).replace(/\/+$/, "");
  return `${trimmed}/api/preflight/v1/apps/${encodeURIComponent(appId)}/errors`;
}

/**
 * Generate a client-side unique id for idempotent dedup. RFC4122-v4 shaped;
 * uses Math.random so it stays pure and dependency-free (uniqueness here only
 * needs to be good enough to dedup retries of the same event).
 */
export function generateEventId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function normalizeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      stack: typeof error.stack === "string" ? error.stack : undefined,
    };
  }
  if (typeof error === "string") {
    return { name: "Error", message: error };
  }
  if (error && typeof error === "object") {
    const record = error as {
      name?: unknown;
      message?: unknown;
      stack?: unknown;
    };
    let message: string;
    if (typeof record.message === "string") {
      message = record.message;
    } else {
      try {
        message = JSON.stringify(error);
      } catch {
        message = String(error);
      }
    }
    return {
      name: typeof record.name === "string" ? record.name : "Error",
      message,
      stack: typeof record.stack === "string" ? record.stack : undefined,
    };
  }
  return { name: "Error", message: String(error) };
}

function moduleFromFilename(filename: string): string | undefined {
  const cleaned = filename.split(/[?#]/)[0];
  if (!cleaned) return undefined;
  const nodeModules = cleaned.split("node_modules/");
  const tail = nodeModules[nodeModules.length - 1] ?? cleaned;
  const segments = tail.split("/").filter(Boolean);
  const base = segments[segments.length - 1];
  return base || undefined;
}

function extractLocation(location: string): {
  filename?: string;
  lineno?: number;
  colno?: number;
} {
  const trimmed = location.trim();
  const withCol = trimmed.match(/^(.*?):(\d+):(\d+)$/);
  if (withCol?.[1]) {
    return {
      filename: withCol[1],
      lineno: Number(withCol[2]),
      colno: Number(withCol[3]),
    };
  }
  const withLine = trimmed.match(/^(.*?):(\d+)$/);
  if (withLine?.[1]) {
    return { filename: withLine[1], lineno: Number(withLine[2]) };
  }
  return { filename: trimmed || undefined };
}

function frameFrom(
  fn: string | undefined,
  location: string,
): PreflightStackFrame {
  const loc = extractLocation(location);
  const frame: PreflightStackFrame = {};
  const cleanFn = fn?.trim();
  if (cleanFn && cleanFn !== "<unknown>" && cleanFn !== "<anonymous>") {
    frame.function = cleanFn;
  }
  if (loc.filename) {
    frame.filename = loc.filename;
    const mod = moduleFromFilename(loc.filename);
    if (mod) frame.module = mod;
  }
  if (loc.lineno !== undefined && !Number.isNaN(loc.lineno)) {
    frame.lineno = loc.lineno;
  }
  if (loc.colno !== undefined && !Number.isNaN(loc.colno)) {
    frame.colno = loc.colno;
  }
  // Frames outside node_modules are the app's own code.
  frame.inApp = loc.filename ? !loc.filename.includes("node_modules") : true;
  return frame;
}

function parseStackLine(line: string): PreflightStackFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // V8 / Chrome / Node: "at fn (loc)" or "at loc"
  if (trimmed.startsWith("at ")) {
    const rest = trimmed.slice(3).trim();
    const paren = rest.match(/^(.*?)\s+\((.+)\)$/);
    if (paren?.[2]) {
      return frameFrom(paren[1], paren[2]);
    }
    return frameFrom(undefined, rest);
  }

  // JSC / Hermes (React Native): "fn@loc" or "@loc"
  const atIndex = trimmed.indexOf("@");
  if (atIndex !== -1) {
    const fn = trimmed.slice(0, atIndex);
    const location = trimmed.slice(atIndex + 1);
    const looksLikeLocation =
      /:\d+(:\d+)?$/.test(location) ||
      location.includes("/") ||
      location.includes(".");
    if (looksLikeLocation) {
      return frameFrom(fn || undefined, location);
    }
    return null;
  }

  // Bare location "file.js:10:5". Guard against error-message lines (which
  // contain spaces) by only accepting space-free location-shaped tokens.
  if (!trimmed.includes(" ") && /:\d+(:\d+)?$/.test(trimmed)) {
    return frameFrom(undefined, trimmed);
  }

  return null;
}

/**
 * Parse an `error.stack` string into structured frames, most-recent frame
 * first. Handles both V8 (`at fn (file:line:col)`) and JSC/Hermes
 * (`fn@file:line:col`) formats. Frames outside `node_modules` are marked
 * `inApp: true`. Never throws.
 */
export function parseStack(
  stack: string | undefined | null,
): PreflightStackFrame[] {
  if (!stack || typeof stack !== "string") return [];
  const frames: PreflightStackFrame[] = [];
  for (const line of stack.split("\n")) {
    const frame = parseStackLine(line);
    if (frame) frames.push(frame);
  }
  return frames;
}

/**
 * Build a wire-format {@link PreflightErrorEvent} from an unknown thrown value,
 * per-capture metadata, and pre-gathered device context. Pure and
 * unit-testable — takes `deviceCtx` as a parameter rather than reading native
 * modules. Never throws.
 */
export function buildErrorEvent(
  error: unknown,
  meta: BuildErrorEventMeta,
  deviceCtx: PreflightDeviceContext,
): PreflightErrorEvent {
  const normalized = normalizeError(error);
  const isFatal = meta.isFatal ?? false;
  const level: PreflightLevel = meta.level ?? (isFatal ? "fatal" : "error");

  const event: PreflightErrorEvent = {
    provider: "preflight",
    providerEventId: meta.providerEventId ?? generateEventId(),
    level,
    runtime: "expo",
    type: normalized.name,
    message: normalized.message,
    stack: parseStack(normalized.stack),
    isFatal,
    sdk: deviceCtx.sdk ?? {
      name: PREFLIGHT_SDK_NAME,
      version: PREFLIGHT_SDK_VERSION,
    },
    occurredAt: meta.occurredAt ?? new Date().toISOString(),
  };

  if (deviceCtx.platform) event.platform = deviceCtx.platform;
  if (deviceCtx.release) event.release = deviceCtx.release;
  if (deviceCtx.appVersion) event.appVersion = deviceCtx.appVersion;
  if (deviceCtx.osName) event.osName = deviceCtx.osName;
  if (deviceCtx.osVersion) event.osVersion = deviceCtx.osVersion;
  if (deviceCtx.deviceModel) event.deviceModel = deviceCtx.deviceModel;
  if (deviceCtx.sessionId) event.sessionId = deviceCtx.sessionId;
  if (meta.breadcrumbs && meta.breadcrumbs.length > 0) {
    event.breadcrumbs = meta.breadcrumbs;
  }
  if (meta.context) event.context = meta.context;

  return event;
}

/**
 * Fixed-size ring buffer of breadcrumbs. Pure and testable; the newest entries
 * are kept when the buffer overflows.
 */
export class BreadcrumbBuffer {
  private items: PreflightBreadcrumb[] = [];

  constructor(private readonly maxSize = 30) {
    this.maxSize = maxSize > 0 ? maxSize : 30;
  }

  add(breadcrumb: PreflightBreadcrumb): void {
    const timestamp = breadcrumb.timestamp ?? new Date().toISOString();
    this.items.push({ ...breadcrumb, timestamp });
    if (this.items.length > this.maxSize) {
      this.items.splice(0, this.items.length - this.maxSize);
    }
  }

  snapshot(): PreflightBreadcrumb[] {
    return this.items.slice();
  }

  clear(): void {
    this.items = [];
  }
}
