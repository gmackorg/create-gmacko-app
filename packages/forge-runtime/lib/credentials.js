const bytes = (s) => new TextEncoder().encode(s);
const base64 = (b) => btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unbase64 = (s) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
const aad = (context) => bytes(JSON.stringify([context.tenant, context.resource, context.record, context.field]));
export class AesGcmSecretAdapter {
    activeKey;
    authorize;
    audit;
    keys;
    constructor(activeKey, keys, authorize, audit) {
        this.activeKey = activeKey;
        this.authorize = authorize;
        this.audit = audit;
        this.keys = new Map(keys);
        const key = this.keys.get(activeKey);
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(activeKey) || !key || key.algorithm.name !== "AES-GCM" || !key.usages.includes("encrypt"))
            throw Error("invalid secret encryption key");
    }
    async seal(context, plaintext) {
        if (bytes(plaintext).length > 16384)
            throw Error("secret exceeds 16 KiB");
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(context) }, this.keys.get(this.activeKey), bytes(plaintext));
        return `sealed.v1.${this.activeKey}.${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
    }
    async use(context, sealed, consumer) {
        if (!await this.authorize(context))
            throw Error("secret use denied");
        const [tag, version, keyId, nonce, ciphertext, ...extra] = sealed.split(".");
        const key = this.keys.get(keyId ?? "");
        if (tag !== "sealed" || version !== "v1" || !key || !nonce || !ciphertext || extra.length)
            throw Error("invalid sealed credential");
        let plaintext;
        try {
            plaintext = new TextDecoder("utf-8", { fatal: true }).decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(nonce), additionalData: aad(context) }, key, unbase64(ciphertext)));
        }
        catch {
            throw Error("credential authentication failed");
        }
        await this.audit({ ...context, kind: "secret.use", keyId: keyId });
        return consumer(plaintext);
    }
}
