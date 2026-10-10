/**
 * Cloudflare R2 object store. Presigned URLs need S3 credentials for R2, so
 * uploads/downloads are served through the Worker itself by default: the
 * "signed URL" is a Worker route carrying an HMAC-signed, expiring token for
 * one key and method (a bearer capability, like a presigned URL). Direct S3
 * presigning can be enabled by supplying R2 S3 credentials.
 */
import { Effect } from "effect";
import { err } from "../errors.js";
const enc = new TextEncoder();
async function hmac(secret, data) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function signObjectToken(secret, t) {
    const payload = btoa(JSON.stringify(t)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `${payload}.${await hmac(secret, payload)}`;
}
export async function verifyObjectToken(secret, token) {
    const [payload, sig] = token.split(".");
    if (!payload || !sig || sig !== (await hmac(secret, payload)))
        return null;
    const t = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return t.exp > Date.now() ? t : null;
}
export class R2ObjectStore {
    bucket;
    opts;
    name = "r2";
    constructor(bucket, opts) {
        this.bucket = bucket;
        this.opts = opts;
    }
    wrap(f) {
        return Effect.tryPromise({ try: f, catch: (e) => err("StorageUnavailable", String(e.message ?? e)) });
    }
    presignUpload(key, mediaType, byteCount, ttlSeconds) {
        return this.wrap(async () => {
            const exp = Date.now() + ttlSeconds * 1000;
            const token = await signObjectToken(this.opts.secret, { key, method: "PUT", exp, mediaType, byteCount });
            return { url: `${this.opts.baseUrl}/_forge/objects/${token}`, method: "PUT", headers: { "content-type": mediaType, "content-length": String(byteCount) }, expiresAt: new Date(exp).toISOString() };
        });
    }
    head(key) {
        return this.wrap(async () => {
            const h = await this.bucket.head(key);
            return h ? { byteCount: h.size, mediaType: h.httpMetadata?.contentType ?? null, generation: h.etag } : null;
        });
    }
    digest(key, maxBytes) {
        return this.wrap(async () => {
            const o = await this.bucket.get(key);
            if (!o)
                throw new Error("object missing");
            if (o.size > maxBytes)
                throw new Error("object exceeds policy");
            const buf = new Uint8Array(await new Response(o.body).arrayBuffer());
            const d = await crypto.subtle.digest("SHA-256", buf);
            return { sha256: [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""), byteCount: buf.length };
        });
    }
    seal(stagingKey, sealedKey, mediaType) {
        return this.wrap(async () => {
            const o = await this.bucket.get(stagingKey);
            if (!o)
                throw new Error("staging object missing");
            const put = await this.bucket.put(sealedKey, o.body, { httpMetadata: { contentType: mediaType } });
            return { generation: put.etag };
        });
    }
    presignDownload(key, ttlSeconds, mediaType) {
        return this.wrap(async () => {
            const exp = Date.now() + ttlSeconds * 1000;
            const token = await signObjectToken(this.opts.secret, { key, method: "GET", exp, mediaType });
            return { url: `${this.opts.baseUrl}/_forge/objects/${token}`, method: "GET", expiresAt: new Date(exp).toISOString() };
        });
    }
    delete(key) {
        return this.wrap(() => this.bucket.delete(key));
    }
    /** Serve `/_forge/objects/<token>`: the Worker-side equivalent of a presigned URL. */
    async serve(request, token) {
        const t = await verifyObjectToken(this.opts.secret, token);
        if (!t)
            return new Response(JSON.stringify({ code: "Forbidden", detail: "object token invalid or expired" }), { status: 403, headers: { "content-type": "application/problem+json" } });
        if (request.method !== t.method)
            return new Response(null, { status: 405 });
        if (t.method === "PUT") {
            const len = Number(request.headers.get("content-length") ?? "0");
            if (t.byteCount !== undefined && len !== t.byteCount)
                return new Response(JSON.stringify({ code: "PayloadTooLarge", detail: "content-length does not match the upload intent" }), { status: 413 });
            const body = await request.arrayBuffer();
            if (t.byteCount !== undefined && body.byteLength !== t.byteCount)
                return new Response(JSON.stringify({ code: "PayloadTooLarge" }), { status: 413 });
            await this.bucket.put(t.key, body, { httpMetadata: { contentType: t.mediaType } });
            return new Response(null, { status: 204 });
        }
        const o = await this.bucket.get(t.key);
        if (!o)
            return new Response(null, { status: 404 });
        return new Response(o.body, { status: 200, headers: { "content-type": t.mediaType, "content-length": String(o.size), "cache-control": "private, no-store" } });
    }
}
