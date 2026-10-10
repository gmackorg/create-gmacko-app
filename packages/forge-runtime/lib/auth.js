import { err } from "./errors.js";
const b64url = {
    encode: (bytes) => Buffer.from(bytes).toString("base64url"),
    decode: (s) => new Uint8Array(Buffer.from(s, "base64url")),
};
async function hmacKey(secret, usage) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}
/** Test helper: sign an HS256 token. */
export async function signTestJwt(payload, secret) {
    const enc = (o) => b64url.encode(new TextEncoder().encode(JSON.stringify(o)));
    const signing = `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}`;
    const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), new TextEncoder().encode(signing));
    return `${signing}.${b64url.encode(new Uint8Array(sig))}`;
}
export function jwtAuth(o) {
    const skew = o.clockSkewSeconds ?? 30;
    return {
        scheme: "bearer-jwt",
        async authenticate(req) {
            const header = req.headers.get("authorization") ?? "";
            const m = /^Bearer\s+(.+)$/i.exec(header);
            if (!m)
                return err("Unauthenticated", "a bearer token is required");
            const parts = m[1].split(".");
            if (parts.length !== 3)
                return err("Unauthenticated", "malformed token");
            let hdr;
            let payload;
            try {
                hdr = JSON.parse(new TextDecoder().decode(b64url.decode(parts[0])));
                payload = JSON.parse(new TextDecoder().decode(b64url.decode(parts[1])));
            }
            catch {
                return err("Unauthenticated", "malformed token");
            }
            // Algorithm is pinned by configuration, never taken from the token alone.
            const expected = o.secret ? "HS256" : null;
            const signing = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
            const sig = b64url.decode(parts[2]);
            let valid = false;
            if (o.secret && hdr.alg === expected) {
                valid = await crypto.subtle.verify("HMAC", await hmacKey(o.secret, "verify"), sig, signing);
            }
            else if (o.jwks && (hdr.alg === "RS256" || hdr.alg === "ES256")) {
                const jwk = o.jwks.keys.find((k) => !hdr.kid || k.kid === hdr.kid);
                if (jwk) {
                    const algo = hdr.alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "ECDSA", namedCurve: "P-256" };
                    const key = await crypto.subtle.importKey("jwk", jwk, algo, false, ["verify"]).catch(() => null);
                    if (key)
                        valid = await crypto.subtle.verify(hdr.alg === "RS256" ? "RSASSA-PKCS1-v1_5" : { name: "ECDSA", hash: "SHA-256" }, key, sig, signing);
                }
            }
            if (!valid)
                return err("Unauthenticated", "token signature is not valid for the configured issuer");
            const now = Math.floor(Date.now() / 1000);
            if (payload["iss"] !== o.issuer)
                return err("Unauthenticated", "token issuer is not trusted");
            const aud = payload["aud"];
            if (!(aud === o.audience || (Array.isArray(aud) && aud.includes(o.audience))))
                return err("Unauthenticated", "token audience does not name this deployment");
            if (typeof payload["exp"] !== "number" || payload["exp"] + skew < now)
                return err("Unauthenticated", "token expired");
            if (typeof payload["nbf"] === "number" && payload["nbf"] - skew > now)
                return err("Unauthenticated", "token not yet valid");
            const tenant = payload[o.claims.tenant];
            const actor = payload[o.claims.actor];
            if (typeof tenant !== "string" || typeof actor !== "string")
                return err("Unauthenticated", "token carries no tenant/actor claims");
            const purposes = o.claims.purposes ? payload[o.claims.purposes] : undefined;
            return {
                tenant,
                actor,
                issuer: o.issuer,
                ...(Array.isArray(purposes) ? { purposes: purposes.map(String) } : {}),
                ...(o.claims.workload && typeof payload[o.claims.workload] === "string" ? { workload: String(payload[o.claims.workload]) } : {}),
            };
        },
    };
}
