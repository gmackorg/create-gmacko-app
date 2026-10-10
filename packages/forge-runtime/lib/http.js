/**
 * HTTP binding of generated operations (plan §12). Runtime-agnostic: takes a
 * Fetch `Request`, returns a `Response`, so Workers and Lambda share it.
 */
import { Cause, Effect } from "effect";
import { err, ForgeError } from "./errors.js";
import { spanFromTraceparent, traceparent } from "./telemetry.js";
/** Development-only: trust `x-forge-tenant` / `x-forge-actor` headers. Must be enabled explicitly. */
export function devHeaderAuth() {
    return {
        scheme: "dev-header",
        async authenticate(req) {
            const tenant = req.headers.get("x-forge-tenant");
            if (!tenant)
                return err("Unauthenticated", "x-forge-tenant header is required (development header auth)");
            return { tenant, actor: req.headers.get("x-forge-actor") ?? "anonymous" };
        },
    };
}
/** FORGE-056 discovery document: identity, digests, features and links. Counts, not a catalogue; the OpenAPI projection carries operations. */
export function discovery(model, auth) {
    const b = model.bundle;
    const features = ["changesets", "imports", "admin.portability", "governance", "invocation-preconditions"];
    if (model.workflows.length)
        features.push("workflows");
    if (b.realtime && b.realtime.streams?.length)
        features.push("realtime");
    if (model.views.length || model.projections.length || model.caches.length)
        features.push("readmodels");
    if (model.sources.length)
        features.push("schedules");
    return {
        version: "forge-discovery/1",
        package: { name: b.ir.package.name, version: b.ir.package.version },
        edition: b.ir.package.edition,
        profile: b.ir.package.profile,
        buildHash: b.buildHash,
        digests: b.digests ?? {},
        contracts: { version: b.contracts.version },
        features,
        auth: { scheme: auth.scheme ?? "bearer", purposeHeader: "x-forge-purpose" },
        operations: { resources: b.contracts.resources.length, functions: model.functions.filter((f) => f.http).length, workflows: model.workflows.length, http: model.httpOperations().length + model.functions.filter((f) => f.http).length },
        links: { openapi: "/forge/openapi.json", mcp: "/forge/mcp" },
    };
}
/** Built-in routes (plan §12): changesets. Bound under the package's API prefix. */
function builtinRoutes(model) {
    const pkg = model.bundle.ir.package.name;
    const mk = (method, path, action) => ({
        method,
        segments: path.split("/").filter(Boolean).map((s) => (s.startsWith("{") ? { param: s.slice(1, -1) } : { literal: s })),
        ref: { op: { id: `${pkg}/_/changesets.${action}`, kind: `changeset.${action}`, http: { method, path } }, resource: undefined },
    });
    const imp = (method, path, action) => ({
        method,
        segments: path.split("/").filter(Boolean).map((s) => (s.startsWith("{") ? { param: s.slice(1, -1) } : { literal: s })),
        ref: { op: { id: `${pkg}/_/imports.${action}`, kind: `import.${action}`, http: { method, path } }, resource: undefined },
    });
    const adm = (method, path, action) => ({
        method,
        segments: path.split("/").filter(Boolean).map((s) => ({ literal: s })),
        ref: { op: { id: `${pkg}/_/admin.${action}`, kind: `admin.${action}`, http: { method, path } }, resource: undefined },
    });
    return [
        // Provider switching (plan §22): operator-only canonical export/import/verify and the write fence.
        adm("POST", "/v1/admin/export", "export"),
        adm("POST", "/v1/admin/import", "import"),
        adm("POST", "/v1/admin/verify", "verify"),
        adm("POST", "/v1/admin/fence", "fence"),
        // Governance (plan §7): subject location and content inspection verdicts.
        adm("POST", "/v1/admin/subjects/locate", "subjects.locate"),
        adm("POST", "/v1/admin/inspect", "inspect"),
        imp("POST", "/v1/imports/inspect", "inspect"),
        imp("POST", "/v1/imports/stage", "stage"),
        mk("POST", "/v1/changesets", "propose"),
        mk("GET", "/v1/changesets/{id}", "get"),
        mk("GET", "/v1/changesets/{id}/preview", "preview"),
        mk("POST", "/v1/changesets/{id}/approve", "approve"),
        mk("POST", "/v1/changesets/{id}/commit", "commit"),
    ];
}
/** Views, projections and caches (plan §16–17) bind the same paths the generated client uses. */
function readModelRoutes(model) {
    const seg = (path) => path.split("/").filter(Boolean).map((s) => (s.startsWith("{") ? { param: s.slice(1, -1) } : { literal: s }));
    const route = (method, path, id, kind) => ({ method, segments: seg(path), ref: { op: { id, kind, http: { method, path } }, resource: undefined } });
    const routes = [];
    for (const v of model.views)
        routes.push(route("GET", `/v1/views/${kebab(v.name)}`, `${v.id}.query`, "view.query"));
    for (const p of model.projections) {
        const base = p.crud?.path ?? `/v1/projections/${kebab(p.name)}`;
        routes.push(route("GET", `${base}/status`, `${p.id}.status`, "projection.status"));
        routes.push(route("POST", `${base}/rebuild`, `${p.id}.rebuild`, "projection.rebuild"));
        routes.push(route("GET", `${base}/{id}`, `${p.id}.get`, "projection.get"));
    }
    for (const c of model.caches)
        routes.push(route("GET", `/v1/caches/${kebab(c.name)}`, `${c.id}.read`, "cache.read"));
    for (const s of model.sources) {
        routes.push(route("GET", `/v1/schedules/${kebab(s.name)}`, `${s.id}.status`, "schedule.status"));
        routes.push(route("POST", `/v1/schedules/${kebab(s.name)}/tick`, `${s.id}.tick`, "schedule.tick"));
    }
    for (const w of model.workflows) {
        const base = `/v1/workflows/${kebab(w.name)}`;
        routes.push(route(w.http?.method ?? "POST", w.http?.path ?? base, `${w.id}.start`, "workflow.start"));
        routes.push(route("POST", `${base}/signals/{message}`, `${w.id}.signal`, "workflow.signal"));
        routes.push(route("GET", `${base}/{id}`, `${w.id}.get`, "workflow.get"));
        routes.push(route("POST", `${base}/{id}/cancel`, `${w.id}.cancel`, "workflow.cancel"));
    }
    return routes;
}
function kebab(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}
function compile(model) {
    const routes = model.httpOperations().map((ref) => ({
        method: ref.op.http.method,
        segments: ref.op.http.path.split("/").filter(Boolean).map((s) => (s.startsWith("{") ? { param: s.slice(1, -1) } : { literal: s })),
        ref,
    }));
    for (const f of model.functions) {
        if (!f.http)
            continue;
        routes.push({ method: f.http.method, segments: f.http.path.split("/").filter(Boolean).map((s) => (s.startsWith("{") ? { param: s.slice(1, -1) } : { literal: s })), ref: { op: { id: f.id, kind: "function", http: f.http }, resource: undefined } });
    }
    routes.push(...builtinRoutes(model));
    routes.push(...readModelRoutes(model));
    // Static segments win over parameters at the same position.
    routes.sort((a, b) => {
        const n = Math.max(a.segments.length, b.segments.length);
        for (let i = 0; i < n; i++) {
            const x = a.segments[i]?.literal ? 0 : 1;
            const y = b.segments[i]?.literal ? 0 : 1;
            if (x !== y)
                return x - y;
        }
        return 0;
    });
    return routes;
}
function match(route, path) {
    if (route.segments.length !== path.length)
        return null;
    const params = {};
    for (let i = 0; i < path.length; i++) {
        const seg = route.segments[i];
        if (seg.literal !== undefined) {
            if (seg.literal !== path[i])
                return null;
        }
        else {
            params[seg.param] = decodeURIComponent(path[i]);
        }
    }
    return params;
}
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
export function createHttpHandler(model, engine, options) {
    const routes = compile(model);
    const maxBody = options.maxBodyBytes ?? 1_048_576;
    const problem = (e, requestId) => new Response(JSON.stringify(e.problem(requestId)), { status: e.status, headers: { "content-type": "application/problem+json", "x-request-id": requestId } });
    const corsHeaders = (req) => {
        const origin = req.headers.get("origin");
        if (!options.cors || !origin)
            return {};
        const allowed = options.cors.origins.includes("*") ? "*" : options.cors.origins.includes(origin) ? origin : null;
        if (!allowed)
            return {};
        return {
            "access-control-allow-origin": allowed,
            "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
            "access-control-allow-headers": "content-type,if-match,idempotency-key,x-forge-tenant,x-forge-actor,x-forge-purpose,authorization",
            "access-control-expose-headers": "etag,x-request-id",
            "access-control-max-age": "600",
            vary: "origin",
        };
    };
    const withCors = (req, res) => {
        const h = corsHeaders(req);
        if (Object.keys(h).length === 0)
            return res;
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(h))
            headers.set(k, v);
        return new Response(res.body, { status: res.status, headers });
    };
    return async (req) => withCors(req, await handle(req));
    async function handle(req) {
        if (req.method === "OPTIONS")
            return new Response(null, { status: 204 });
        const requestId = options.requestId?.(req) ?? crypto.randomUUID();
        const url = new URL(req.url);
        const path = url.pathname.split("/").filter(Boolean);
        // authenticate before routing: anonymous callers learn nothing about the API shape
        const principal = await options.auth.authenticate(req);
        if (principal instanceof ForgeError)
            return problem(principal, requestId);
        if (req.headers.has("x-forge-if-build") && req.headers.get("x-forge-if-build") !== model.bundle.buildHash)
            return new Response(JSON.stringify({ code: "BuildChanged", detail: "Reload the runtime contract before invoking." }), { status: 409, headers: { "content-type": "application/problem+json", "x-request-id": requestId } });
        const mount = options.mounts?.[url.pathname];
        if (mount)
            return mount(req, principal, requestId);
        // FORGE-056: bounded discovery metadata. Compatibility evaluation input, never deployment trust:
        // a client that finds a different digest runs `forgec compat`, it does not assume equivalence.
        if (req.method === "GET" && path[0] === "forge" && path.length === 2) {
            const meta = { "x-forge-build": model.bundle.buildHash, "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=60", "x-request-id": requestId };
            if (path[1] === "discovery")
                return new Response(JSON.stringify(discovery(model, options.auth)), { status: 200, headers: meta });
            if (path[1] === "workspace.json") {
                if (!model.bundle.ui)
                    return problem(err("NotFound", "This build has no record workspace. Rebuild and deploy the application."), requestId);
                const operations = routes.filter(({ ref }) => !!ref.resource || ref.op.kind.startsWith("changeset.") || ref.op.kind.startsWith("import.")).map(({ ref, method, segments }) => ({ id: ref.op.id, kind: ref.op.kind, method,
                    path: "/" + segments.map(s => s.literal ?? `{${s.param}}`).join("/") }));
                return new Response(JSON.stringify({ buildHash: model.bundle.buildHash, descriptor: model.bundle.ui, operations }), { headers: meta });
            }
            if (path[1] === "openapi.json") {
                if (!model.bundle.openapi)
                    return problem(err("NotFound", "this build carries no OpenAPI projection"), requestId);
                return new Response(JSON.stringify(model.bundle.openapi), { status: 200, headers: meta });
            }
        }
        // route
        let matched = null;
        let pathMatchedOtherMethod = false;
        for (const route of routes) {
            const params = match(route, path);
            if (!params)
                continue;
            if (route.method === req.method) {
                matched = { route, params };
                break;
            }
            pathMatchedOtherMethod = true;
        }
        if (!matched)
            return problem(err(pathMatchedOtherMethod ? "MethodNotAllowed" : "NotFound", pathMatchedOtherMethod ? `${req.method} is not allowed here` : "no such route"), requestId);
        // body
        let body = undefined;
        if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
            const text = await req.text();
            const limit = matched.route.ref.op.kind.startsWith("admin.") ? (options.adminMaxBodyBytes ?? 64 * 1_048_576) : maxBody;
            if (text.length > limit)
                return problem(err("PayloadTooLarge", `body exceeds ${limit} bytes`), requestId);
            if (text.length) {
                try {
                    body = JSON.parse(text);
                }
                catch {
                    return problem(err("MalformedRequest", "body is not valid JSON"), requestId);
                }
            }
        }
        // preconditions
        const ifMatch = req.headers.get("if-match");
        let expectedVersion;
        if (ifMatch !== null) {
            const m = /^"?(\d+)"?$/.exec(ifMatch.trim());
            if (!m)
                return problem(err("MalformedRequest", "If-Match must be a version ETag"), requestId);
            expectedVersion = Number(m[1]);
        }
        const { route, params } = matched;
        const kind = route.ref.op.kind;
        let input;
        switch (kind) {
            case "create":
                input = (body ?? {});
                break;
            case "get":
                input = { id: params["id"] };
                break;
            case "update":
                input = { id: params["id"], expectedVersion, patch: body ?? {} };
                break;
            case "delete":
            case "restore":
                input = { id: params["id"], expectedVersion };
                break;
            case "transition":
                input = { id: params["id"], expectedVersion, input: body ?? {} };
                break;
            case "beginUpload":
            case "move":
                input = { id: params["id"], expectedVersion, ...(body ?? {}) };
                break;
            case "children":
            case "ancestors":
                input = { id: params["id"] };
                break;
            case "effective": {
                const q = {};
                for (const [k, v] of url.searchParams)
                    q[k] = v;
                input = { params: q };
                break;
            }
            case "finalizeUpload":
                input = { id: params["id"], expectedVersion };
                break;
            case "download":
                input = { id: params["id"] };
                break;
            case "find":
            case "list": {
                const q = {};
                for (const [k, v] of url.searchParams)
                    q[k] = v;
                const { cursor, limit, ...rest } = q;
                input = { params: rest, ...(cursor ? { cursor } : {}), ...(limit ? { limit: Number(limit) } : {}) };
                break;
            }
            case "changeset.propose":
            case "import.inspect":
            case "import.stage":
            case "admin.export":
            case "admin.import":
            case "admin.verify":
            case "admin.fence":
            case "admin.subjects.locate":
            case "admin.inspect":
                input = (body ?? {});
                break;
            case "function":
                // Path parameters bind input fields by name (plan §5.4); If-Match supplies expectedVersion when declared.
                input = { ...(body ?? {}), ...params, ...(expectedVersion !== undefined ? { expectedVersion } : {}) };
                break;
            case "changeset.get":
            case "changeset.preview":
            case "changeset.commit":
            case "projection.get":
                input = { id: params["id"] };
                break;
            case "projection.status":
            case "projection.rebuild":
                input = {};
                break;
            case "workflow.start":
                // Path parameters bind input fields by name, like function bindings.
                input = { ...(body ?? {}), ...params };
                break;
            case "workflow.get":
            case "workflow.cancel":
                input = { id: params["id"] };
                break;
            case "schedule.status":
                input = {};
                break;
            case "schedule.tick":
                input = (body ?? {});
                break;
            case "workflow.signal":
                input = { message: params["message"], ...(body ?? {}) };
                break;
            case "view.query": {
                const q = {};
                for (const [k, v] of url.searchParams)
                    q[k] = v;
                const { cursor, limit, ...rest } = q;
                input = { params: rest, ...(cursor ? { cursor } : {}), ...(limit ? { limit: Number(limit) } : {}) };
                break;
            }
            case "cache.read": {
                const key = {};
                for (const [k, v] of url.searchParams)
                    key[k] = v;
                input = { key };
                break;
            }
            case "changeset.approve":
                input = { id: params["id"], ...(body ?? {}) };
                break;
            default:
                return problem(err("MethodNotAllowed", `unsupported operation kind ${kind}`), requestId);
        }
        const trace = spanFromTraceparent(req.headers.get("traceparent"));
        const purposeHeader = req.headers.get("x-forge-purpose");
        if (purposeHeader && principal.purposes && !principal.purposes.includes(purposeHeader)) {
            return problem(err("NotPermitted", "the credential does not allow the requested purpose"), requestId);
        }
        const ctx = { tenant: principal.tenant, actor: principal.actor, requestId, trace, ...(purposeHeader ? { purpose: purposeHeader } : {}), ...(req.headers.get("idempotency-key") ? { idempotencyKey: req.headers.get("idempotency-key") } : {}) };
        const exit = await Effect.runPromiseExit(engine.call(route.ref.op.id, input, ctx));
        if (exit._tag === "Failure") {
            const e = Cause.squash(exit.cause);
            if (e instanceof ForgeError)
                return problem(e, requestId);
            console.error("forge: unhandled failure", requestId, e);
            return problem(err("Internal", "unexpected failure"), requestId);
        }
        const value = exit.value;
        const headers = { ...JSON_HEADERS, "x-request-id": requestId, traceparent: traceparent(trace) };
        if (value && typeof value["version"] === "number")
            headers["etag"] = `"${value["version"]}"`;
        return new Response(JSON.stringify(value), { status: kind === "create" || kind === "changeset.propose" ? 201 : 200, headers });
    }
}
