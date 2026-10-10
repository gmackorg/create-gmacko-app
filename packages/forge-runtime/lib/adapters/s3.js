/** AWS S3 object store: real presigned PUT/GET, HEAD for verification, CopyObject to seal. */
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Effect } from "effect";
import { err } from "../errors.js";
export class S3ObjectStore {
    bucket;
    name = "s3";
    s3;
    constructor(bucket, region, client) {
        this.bucket = bucket;
        this.s3 = client ?? new S3Client({ region });
    }
    wrap(f) {
        return Effect.tryPromise({ try: f, catch: (e) => err("StorageUnavailable", String(e.message ?? e)) });
    }
    presignUpload(key, mediaType, byteCount, ttlSeconds) {
        return this.wrap(async () => {
            const url = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mediaType, ContentLength: byteCount }), { expiresIn: ttlSeconds });
            return { url, method: "PUT", headers: { "content-type": mediaType, "content-length": String(byteCount) }, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
        });
    }
    head(key) {
        return this.wrap(async () => {
            try {
                const h = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
                return { byteCount: Number(h.ContentLength ?? 0), mediaType: h.ContentType ?? null, generation: h.VersionId ?? h.ETag ?? null };
            }
            catch (e) {
                if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404)
                    return null;
                throw e;
            }
        });
    }
    digest(key, maxBytes) {
        return this.wrap(async () => {
            const o = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
            const bytes = await o.Body.transformToByteArray();
            if (bytes.length > maxBytes)
                throw new Error("object exceeds policy");
            const d = await crypto.subtle.digest("SHA-256", bytes);
            return { sha256: [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""), byteCount: bytes.length };
        });
    }
    seal(stagingKey, sealedKey, mediaType) {
        return this.wrap(async () => {
            const r = await this.s3.send(new CopyObjectCommand({ Bucket: this.bucket, CopySource: `${this.bucket}/${encodeURIComponent(stagingKey)}`, Key: sealedKey, ContentType: mediaType, MetadataDirective: "REPLACE" }));
            return { generation: r.VersionId ?? r.CopyObjectResult?.ETag ?? null };
        });
    }
    presignDownload(key, ttlSeconds, mediaType) {
        return this.wrap(async () => {
            const url = await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentType: mediaType }), { expiresIn: ttlSeconds });
            return { url, method: "GET", expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
        });
    }
    delete(key) {
        return this.wrap(() => this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).then(() => undefined));
    }
}
