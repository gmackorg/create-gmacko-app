import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import { NotFound } from "../errors";
import { SessionOrKey } from "../security";
import { CreatePost, Post, PostId } from "./models";

/** Posts have no owner column; any credential with the scope may write or delete. */
export class PostsApi extends HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Post),
    }),
  )
  .add(
    HttpApiEndpoint.get("byId", "/:id", {
      params: { id: PostId },
      success: Post,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: CreatePost,
      success: Post.pipe(HttpApiSchema.status(201)),
    }).middleware(SessionOrKey("write")),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: PostId },
      error: NotFound,
    }).middleware(SessionOrKey("delete")),
  )
  .prefix("/posts") {}
