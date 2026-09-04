import { Schema } from "effect";
import { Model } from "effect/unstable/schema";

import { PostId } from "./ids";

/** `post`. `updatedAt` stays null until the first update (`$onUpdateFn`). */
export class PostModel extends Model.Class<PostModel>("PostModel")({
  id: Model.GeneratedByApp(PostId),
  title: Schema.String,
  content: Schema.String,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}
