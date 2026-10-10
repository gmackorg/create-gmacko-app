/** Runtime services (Effect 4): clock, id generation, storage, cursor secret. */
import { Context } from "effect";
export class Clock extends Context.Service()("forge/Clock") {
}
export class IdGen extends Context.Service()("forge/IdGen") {
}
export class Storage extends Context.Service()("forge/Storage") {
}
export class CursorSecret extends Context.Service()("forge/CursorSecret") {
}
export class Objects extends Context.Service()("forge/Objects") {
}
