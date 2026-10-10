/** Node Git adapter. Only configured local repositories are accessible; fetching and
 * authentication remain host responsibilities. No selector is passed to a shell. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { validateSpecificationPin } from "./specification.js";
const exec = promisify(execFile);
export class GitSpecificationProvider {
    repositories;
    constructor(repositories) {
        this.repositories = new Map(Object.entries(repositories).map(([id, config]) => [id, { ...config }]));
    }
    config(repository) {
        const config = this.repositories.get(repository);
        if (!config)
            throw new Error("Unknown specification repository");
        return config;
    }
    async git(repository, args) {
        const { stdout } = await exec("git", ["--no-replace-objects", "-C", this.config(repository).directory, ...args], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024, timeout: 15_000 });
        return stdout;
    }
    async blob(repository, revision, path) {
        if (!path || path.startsWith("/") || path.split("/").some(p => p === ".." || p === ".") || /[\0\\]/.test(path))
            throw new Error("Invalid pinned source path");
        return this.git(repository, ["cat-file", "blob", `${revision}:${path}`]);
    }
    async resolveSelector(request) {
        if (!request.selector || request.selector.length > 1024 || /[\0\r\n]/.test(request.selector))
            throw new Error("Invalid Git selector");
        const revision = (await this.git(request.repository, ["rev-parse", "--verify", "--end-of-options", `${request.selector}^{commit}`])).toString("utf8").trim();
        const pin = { repository: request.repository, anchor: request.anchor, revision };
        validateSpecificationPin(pin);
        const { map } = await this.sourceMap(pin);
        if (!Object.hasOwn(map.anchors, pin.anchor))
            throw new Error("Semantic anchor is absent at selected commit");
        return pin;
    }
    async sourceMap(pin) {
        validateSpecificationPin(pin);
        const config = this.config(pin.repository);
        const map = JSON.parse((await this.blob(pin.repository, pin.revision, config.sourceMap)).toString("utf8"));
        if (map.version !== "forge-source-map/1" || map.revision != null && map.revision !== pin.revision || !map.sources || !map.anchors)
            throw new Error("Invalid or mismatched pinned source map");
        const lengths = new Map();
        for (const [path, source] of Object.entries(map.sources)) {
            const bytes = await this.blob(pin.repository, pin.revision, path);
            if (source.digest !== `sha256:${createHash("sha256").update(bytes).digest("hex")}` || source.byteLength !== bytes.length)
                throw new Error("Pinned source digest mismatch");
            lengths.set(path, bytes.length);
        }
        for (const span of Object.values(map.anchors)) {
            if (!lengths.has(span.file) || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end < span.start || span.end > lengths.get(span.file))
                throw new Error("Invalid source span in pinned map");
        }
        return { repository: pin.repository, map: { version: "forge-source-map/1", revision: pin.revision, anchors: map.anchors } };
    }
    /** Dependency closure is read from the pinned tree, never the working directory. */
    async lockfile(pin) {
        validateSpecificationPin(pin);
        return (await this.blob(pin.repository, pin.revision, "forge.lock")).toString("utf8");
    }
}
