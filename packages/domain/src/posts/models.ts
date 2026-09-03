import { Schema } from "effect";

import { boundedString, id, stringBetween } from "../primitives";

export const PostId = id("PostId");
export type PostId = typeof PostId.Type;

export class Post extends Schema.Class<Post>("Post")({
  id: PostId,
  title: Schema.String,
  content: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.NullOr(Schema.Date),
}) {}

/** Title 1..256 (the old zod schema allowed empty; the form never should have), content up to 256. */
export class CreatePost extends Schema.Class<CreatePost>("CreatePost")({
  title: stringBetween(1, 256),
  content: boundedString(256),
}) {}

/** Standard Schema view for TanStack Form validators. */
export const CreatePostForm = Schema.toStandardSchemaV1(CreatePost);
