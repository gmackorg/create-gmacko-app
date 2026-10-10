/**
 * Filesystem-backed object bucket for the Node host (plan §5.4): the same
 * `R2Like` surface the Cloudflare adapter drives, so `R2ObjectStore` (HMAC
 * signed URLs served by the host at `/_forge/objects/<token>`) works unchanged
 * over a directory. Keys are hashed into the directory layout; content type
 * and etag live in a sidecar. Not a durable multi-node store: for that, S3/R2.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
export class FsBucket {
    root;
    constructor(root) {
        this.root = root;
    }
    pathOf(key) {
        const h = createHash("sha256").update(key).digest("hex");
        return join(this.root, h.slice(0, 2), h);
    }
    async meta(key) {
        try {
            return JSON.parse(await readFile(this.pathOf(key) + ".meta.json", "utf8"));
        }
        catch {
            return null;
        }
    }
    async head(key) {
        const m = await this.meta(key);
        return m ? { size: m.size, ...(m.contentType ? { httpMetadata: { contentType: m.contentType } } : {}), etag: m.etag } : null;
    }
    async get(key) {
        const m = await this.meta(key);
        if (!m)
            return null;
        const bytes = await readFile(this.pathOf(key));
        return { body: Readable.toWeb(Readable.from([bytes])), size: m.size, ...(m.contentType ? { httpMetadata: { contentType: m.contentType } } : {}), etag: m.etag };
    }
    async put(key, value, options) {
        const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(await new Response(value).arrayBuffer());
        const p = this.pathOf(key);
        await mkdir(join(p, ".."), { recursive: true });
        const etag = createHash("md5").update(bytes).digest("hex");
        await writeFile(p, bytes);
        await writeFile(p + ".meta.json", JSON.stringify({ size: bytes.length, contentType: options?.httpMetadata?.contentType, etag }));
        return { etag };
    }
    async delete(key) {
        const p = this.pathOf(key);
        await rm(p, { force: true });
        await rm(p + ".meta.json", { force: true });
    }
    async exists(key) {
        try {
            await stat(this.pathOf(key));
            return true;
        }
        catch {
            return false;
        }
    }
}
