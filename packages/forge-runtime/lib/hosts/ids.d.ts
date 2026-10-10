/** Production id generation: time-ordered, URL-safe, unguessable. */
import type { Resource } from "../model.js";
export declare function productionIds(): {
    next: (r: Resource) => string;
    opId: () => `${string}-${string}-${string}-${string}-${string}`;
};
