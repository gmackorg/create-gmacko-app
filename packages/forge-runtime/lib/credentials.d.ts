/** Secret payloads stay sealed in records. Key material is supplied by the host,
 * never by the compiled bundle. Plaintext is available only inside authorized use. */
export interface SecretContext {
    tenant: string;
    resource: string;
    record: string;
    field: string;
}
export interface SecretUseContext extends SecretContext {
    actor: string;
    purpose: string;
}
export interface SecretAdapter {
    seal(context: SecretContext, plaintext: string): Promise<string>;
}
export declare class AesGcmSecretAdapter implements SecretAdapter {
    private readonly activeKey;
    private readonly authorize;
    private readonly audit;
    private readonly keys;
    constructor(activeKey: string, keys: ReadonlyMap<string, CryptoKey>, authorize: (context: SecretUseContext) => Promise<boolean>, audit: (event: SecretUseContext & {
        kind: "secret.use";
        keyId: string;
    }) => Promise<void>);
    seal(context: SecretContext, plaintext: string): Promise<string>;
    use<A>(context: SecretUseContext, sealed: string, consumer: (plaintext: string) => Promise<A>): Promise<A>;
}
