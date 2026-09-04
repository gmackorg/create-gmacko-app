import { Schema } from "effect";

import { PostId } from "../models/ids";
import { PostModel } from "../models/posts";
import { boundedString, stringBetween } from "../primitives";

export { PostId };

/** The `post` row as the API returns it: `PostModel.json`, named. */
export class Post extends Schema.Class<Post>("Post")(PostModel.json.fields) {}

/** Title 1..256 (the old zod schema allowed empty; the form never should have), content up to 256. */
export class CreatePost extends Schema.Class<CreatePost>("CreatePost")({
  title: stringBetween(1, 256),
  content: boundedString(256),
}) {}

/** Standard Schema view for TanStack Form validators. */
export const CreatePostForm = Schema.toStandardSchemaV1(CreatePost);
