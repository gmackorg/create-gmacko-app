/**
 * `TestApi`: the whole stack in-process for a test suite. Real handlers,
 * real middlewares, real better-auth over the sqlite-node `layerTest`, a
 * fixed `AppConfig`, `Background.layerSync`, an in-memory rate limiter, and
 * a tracer and logger that record into arrays. Calls go through the web
 * handler (`makeWebHandler`), so decoding, middleware and status mapping are
 * exercised the way the app exercises them. Node only: never part of the
 * Worker bundle.
 */
import { inspect } from "node:util";

import type { MagicLink } from "@gmacko/auth";
import { ApiKeys } from "@gmacko/auth/api-keys";
import { Auth } from "@gmacko/auth/service";
import { signInWithMagicLink, testAuthOptions } from "@gmacko/auth/testing";
import { Database } from "@gmacko/db";
import { user, workspace, workspaceMembership } from "@gmacko/db/schema";
import { layerTest } from "@gmacko/db/testing";
import {
  type ApiKeyCreated,
  type ApiKeyScope,
  AppApi,
  type UserRole,
  type WorkspaceMemberRole,
} from "@gmacko/domain";
import { eq } from "drizzle-orm";
import {
  Cause,
  type Context,
  Effect,
  type Fiber,
  Layer,
  Logger,
  type LogLevel,
  ManagedRuntime,
  Option,
  References,
  Result,
  Tracer,
} from "effect";
import {
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { Background } from "./background";
import {
  AppConfig,
  type AppConfigShape,
  defaultFeatures,
  type FeatureFlags,
  type Stage,
} from "./config";
import { type ApiHandler, makeWebHandler } from "./handler";
import type { AppServices } from "./layer";
import { defaultRateLimits, RateLimiter, type RateLimits } from "./rate-limit";

export const TEST_BASE_URL = "http://localhost:3001";

/** The five scopes with a limit no suite reaches; a test passes its own to hit 429. */
export const generousRateLimits: RateLimits = Object.fromEntries(
  Object.entries(defaultRateLimits).map(([scope, policy]) => [
    scope,
    { ...policy, limit: 1_000_000 },
  ]),
) as RateLimits;

/** A fixed config; tests override the stage or a feature switch. */
export const testAppConfig = (overrides?: {
  readonly stage?: Stage;
  readonly features?: Partial<FeatureFlags>;
  readonly allowedOrigins?: ReadonlyArray<string>;
}): AppConfigShape => ({
  stage: overrides?.stage ?? "development",
  version: "0.0.0-test",
  appUrl: TEST_BASE_URL,
  allowedOrigins: overrides?.allowedOrigins ?? [TEST_BASE_URL],
  auth: {
    secret: "test-secret-that-is-long-enough-for-better-auth",
    baseUrl: TEST_BASE_URL,
    productionUrl: TEST_BASE_URL,
    bypassMagicLink: true,
    github: { clientId: "gh-client", clientSecret: "gh-secret" },
    google: { clientId: "google-client", clientSecret: "google-secret" },
  },
  otlp: { endpoint: undefined, headers: {} },
  features: { ...defaultFeatures, ...overrides?.features },
});

export interface RecordedLog {
  readonly level: LogLevel.LogLevel;
  readonly message: unknown;
  readonly cause: Cause.Cause<unknown>;
  readonly annotations: Readonly<Record<string, unknown>>;
}

export interface Credentials {
  readonly cookie?: string | undefined;
  readonly bearer?: string | undefined;
  /** Defaults to the app origin when a cookie is sent (the cookie rule needs one on non-GET). */
  readonly origin?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
  /** Both better-auth cookies, as a browser would send them. */
  readonly cookie: string;
}

export interface TestWorkspace {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly ownerUserId: string;
}

/** An `HttpClient` that dispatches straight into the in-process handler. */
export const localClient = (
  handler: ApiHandler,
  context?: Context.Context<never>,
): HttpClient.HttpClient =>
  HttpClient.make((request, _url, signal) =>
    HttpClientRequest.toWeb(request, { signal }).pipe(
      Effect.mapError(
        (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.InvalidUrlError({ request, cause }),
          }),
      ),
      Effect.flatMap((web) =>
        Effect.tryPromise({
          try: () => handler(web, context),
          catch: (cause) =>
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, cause }),
            }),
        }),
      ),
      Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
    ),
  );

export type ApiClient = Effect.Success<ReturnType<typeof makeApiClient>>;

const makeApiClient = (
  handler: ApiHandler,
  credentials: Credentials = {},
  context?: Context.Context<never>,
) =>
  HttpApiClient.make(AppApi, {
    baseUrl: TEST_BASE_URL,
    transformClient: HttpClient.mapRequest((request) => {
      const headers: Record<string, string> = { ...credentials.headers };
      if (credentials.cookie !== undefined) {
        headers.cookie = credentials.cookie;
        headers.origin = credentials.origin ?? TEST_BASE_URL;
      } else if (credentials.origin !== undefined) {
        headers.origin = credentials.origin;
      }
      if (credentials.bearer !== undefined) {
        headers.authorization = `Bearer ${credentials.bearer}`;
      }
      return HttpClientRequest.setHeaders(request, headers);
    }),
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, localClient(handler, context)),
  );

export interface TestApiOptions {
  readonly stage?: Stage;
  readonly features?: Partial<FeatureFlags>;
  readonly rateLimits?: Partial<RateLimits>;
  /** Replaces the sqlite-node database (e.g. one whose queries fail). */
  readonly database?: Layer.Layer<Database> | undefined;
}

export interface TestApi {
  readonly baseUrl: string;
  readonly config: AppConfigShape;
  readonly runtime: ManagedRuntime.ManagedRuntime<AppServices | ApiKeys, never>;
  readonly handler: ApiHandler;
  /** Raw request against the handler; `path` is absolute (`/api/...`). */
  readonly fetch: (path: string, init?: RequestInit) => Promise<Response>;
  /** Runs an effect over the stack's services. */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, AppServices | ApiKeys>,
  ) => Promise<A>;
  /** One typed call through the generated client, as `credentials`. */
  readonly call: <A, E>(
    f: (client: ApiClient) => Effect.Effect<A, E>,
    credentials?: Credentials,
    context?: Context.Context<never>,
  ) => Promise<A>;
  /** Like `call`, but the typed failure is returned instead of thrown. */
  readonly result: <A, E>(
    f: (client: ApiClient) => Effect.Effect<A, E>,
    credentials?: Credentials,
  ) => Promise<Result.Result<A, E>>;
  /** Like `result`, but resolves the failure (throws on success). */
  readonly failure: <A, E>(
    f: (client: ApiClient) => Effect.Effect<A, E>,
    credentials?: Credentials,
  ) => Promise<E>;
  /** Signs a new user in through better-auth's magic link; sets `role` when given. */
  readonly createUser: (options?: {
    readonly email?: string;
    readonly name?: string;
    readonly role?: UserRole;
  }) => Promise<TestUser>;
  /** A fresh session cookie for an existing user. */
  readonly signInAs: (user: { readonly email: string }) => Promise<string>;
  readonly createWorkspace: (options: {
    readonly owner: TestUser;
    readonly name?: string;
    readonly slug?: string;
    readonly members?: ReadonlyArray<{
      readonly user: TestUser;
      readonly role: WorkspaceMemberRole;
    }>;
  }) => Promise<TestWorkspace>;
  readonly createApiKey: (
    owner: TestUser,
    scopes: ReadonlyArray<ApiKeyScope>,
    options?: { readonly expiresAt?: Date },
  ) => Promise<ApiKeyCreated>;
  /** Every span the tracer started, in start order. */
  readonly spans: ReadonlyArray<Tracer.NativeSpan>;
  readonly logs: ReadonlyArray<RecordedLog>;
  readonly dispose: () => Promise<void>;
}

const annotationsOf = (
  fiber: Fiber.Fiber<unknown, unknown>,
): Readonly<Record<string, unknown>> =>
  fiber.getRef(References.CurrentLogAnnotations);

export const makeTestApi = (options: TestApiOptions = {}): TestApi => {
  const links: Array<MagicLink> = [];
  const spans: Array<Tracer.NativeSpan> = [];
  const logs: Array<RecordedLog> = [];
  const config = testAppConfig(options);
  const database = options.database ?? layerTest;
  // Generous by default: every call in a suite shares one client key.
  const limits: RateLimits = {
    ...generousRateLimits,
    ...options.rateLimits,
  };

  const tracer = Tracer.make({
    span: (spanOptions) => {
      const span = new Tracer.NativeSpan(spanOptions);
      spans.push(span);
      return span;
    },
  });
  const logger = Logger.make<unknown, void>((entry) => {
    logs.push({
      level: entry.logLevel,
      message: entry.message,
      cause: entry.cause,
      annotations: annotationsOf(entry.fiber),
    });
  });

  const Services = Layer.mergeAll(
    database,
    Layer.succeed(AppConfig)(config),
    Background.layerSync,
    Auth.layer(testAuthOptions(TEST_BASE_URL, links)).pipe(
      Layer.provide(database),
    ),
    ApiKeys.layer.pipe(Layer.provide(database)),
    Layer.succeed(Tracer.Tracer)(tracer),
    Logger.layer([logger]),
  );

  const runtime = ManagedRuntime.make(Services);
  const web = makeWebHandler(Services, {
    memoMap: runtime.memoMap,
    disableLogger: true,
    rateLimiter: RateLimiter.layerMemory(limits),
  });

  const run = <A, E>(effect: Effect.Effect<A, E, AppServices | ApiKeys>) =>
    runtime.runPromise(effect);

  const call: TestApi["call"] = (f, credentials, context) =>
    Effect.runPromise(
      Effect.flatMap(makeApiClient(web.handler, credentials, context), f),
    );
  const result: TestApi["result"] = (f, credentials) =>
    Effect.runPromise(
      Effect.result(Effect.flatMap(makeApiClient(web.handler, credentials), f)),
    );

  // better-auth stores the address lower-cased.
  const userByEmail = (email: string) =>
    run(
      Effect.flatMap(Database, ({ db }) =>
        db
          .select()
          .from(user)
          .where(eq(user.email, email.toLowerCase()))
          .limit(1),
      ),
    ).then((rows) => {
      const row = rows[0];
      if (row === undefined) throw new Error(`no user ${email}`);
      return row;
    });

  const signInAs: TestApi["signInAs"] = ({ email }) =>
    run(
      Effect.flatMap(Auth, (auth) =>
        signInWithMagicLink(auth, TEST_BASE_URL, links, email),
      ),
    ).then((signedIn) => signedIn.cookie);

  let users = 0;
  const createUser: TestApi["createUser"] = async (options = {}) => {
    users += 1;
    const email =
      options.email ??
      `user-${users}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const cookie = await signInAs({ email });
    if (options.role !== undefined || options.name !== undefined) {
      await run(
        Effect.flatMap(Database, ({ db }) =>
          db
            .update(user)
            .set({
              ...(options.role === undefined ? {} : { role: options.role }),
              ...(options.name === undefined ? {} : { name: options.name }),
            })
            .where(eq(user.email, email.toLowerCase())),
        ),
      );
    }
    const row = await userByEmail(email);
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      cookie,
    };
  };

  const createWorkspace: TestApi["createWorkspace"] = ({
    owner,
    name = "Acme",
    slug,
    members = [],
  }) =>
    run(
      Effect.gen(function* () {
        const { db } = yield* Database;
        const [created] = yield* db
          .insert(workspace)
          .values({
            name,
            slug:
              slug ??
              `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`,
            ownerUserId: owner.id,
          })
          .returning();
        if (created === undefined) throw new Error("workspace insert failed");
        yield* db.insert(workspaceMembership).values([
          { workspaceId: created.id, userId: owner.id, role: "owner" },
          ...members.map((member) => ({
            workspaceId: created.id,
            userId: member.user.id,
            role: member.role,
          })),
        ]);
        return {
          id: created.id,
          name: created.name,
          slug: created.slug,
          ownerUserId: created.ownerUserId,
        };
      }),
    );

  const createApiKey: TestApi["createApiKey"] = (owner, scopes, options) =>
    run(
      Effect.flatMap(ApiKeys, (keys) =>
        keys.create(owner.id, {
          name: `key-${scopes.join("+")}`,
          permissions: scopes,
          expiresAt: options?.expiresAt,
        }),
      ),
    );

  return {
    baseUrl: TEST_BASE_URL,
    config,
    runtime,
    handler: web.handler,
    fetch: (path, init) =>
      web.handler(new Request(`${TEST_BASE_URL}${path}`, init)),
    run,
    call,
    result,
    failure: (f, credentials) =>
      result(f, credentials).then((r) => {
        if (Result.isSuccess(r)) {
          throw new Error(
            `expected a failure, got ${JSON.stringify(r.success)}`,
          );
        }
        return r.failure;
      }),
    createUser,
    signInAs,
    createWorkspace,
    createApiKey,
    spans,
    logs,
    dispose: async () => {
      await web.dispose();
      await runtime.dispose();
    },
  };
};

/** The recorded spans named `name`. */
export const spansNamed = (api: TestApi, name: string) =>
  api.spans.filter((span) => span.name === name);

/** Root spans only: no parent, or an external (propagated) parent. */
export const rootSpans = (api: TestApi) =>
  api.spans.filter(
    (span) =>
      Option.isNone(span.parent) || span.parent.value._tag === "ExternalSpan",
  );

/** Log entries whose message (rendered to depth, errors included) or cause mentions `text`. */
export const logsMentioning = (api: TestApi, text: string) =>
  api.logs.filter(
    (entry) =>
      inspect(entry.message, { depth: 8 }).includes(text) ||
      Cause.pretty(entry.cause).includes(text),
  );
