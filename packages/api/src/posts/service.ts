/**
 * `Posts`: the template's demo resource. Posts have no owner column, so any
 * credential with the scope may write or delete; that is the contract's
 * rule, not this service's.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import { Post as PostTable } from "@gmacko/db/schema";
import { NotFound } from "@gmacko/domain/errors";
import { type CreatePost, Post, PostId } from "@gmacko/domain/posts";
import { desc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

export interface PostsShape {
  /** The ten newest, newest first. */
  readonly list: Effect.Effect<ReadonlyArray<Post>, DatabaseError>;
  readonly byId: (id: PostId) => Effect.Effect<Post, NotFound | DatabaseError>;
  readonly create: (input: CreatePost) => Effect.Effect<Post, DatabaseError>;
  readonly remove: (
    id: PostId,
  ) => Effect.Effect<void, NotFound | DatabaseError>;
}

type Row = typeof PostTable.$inferSelect;

const toPost = (row: Row): Post =>
  new Post({
    id: PostId.make(row.id),
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export class Posts extends Context.Service<Posts, PostsShape>()(
  "@gmacko/api/Posts",
) {
  static layer: Layer.Layer<Posts, never, Database> = Layer.effect(Posts)(
    Effect.map(Database, ({ db, first, updateWhere }) =>
      Posts.of({
        list: db
          .select()
          .from(PostTable)
          .orderBy(desc(PostTable.createdAt), desc(PostTable.id))
          .limit(10)
          .pipe(Effect.map((rows) => rows.map(toPost))),
        byId: (id) =>
          first(
            db.select().from(PostTable).where(eq(PostTable.id, id)).limit(1),
            () => new NotFound({ resource: "post", id }),
          ).pipe(Effect.map(toPost)),
        create: (input) =>
          first(
            db
              .insert(PostTable)
              .values({ title: input.title, content: input.content })
              .returning(),
            () => new Error("post insert returned no row"),
          ).pipe(Effect.orDie, Effect.map(toPost)),
        remove: (id) =>
          updateWhere(db.delete(PostTable).where(eq(PostTable.id, id))).pipe(
            Effect.flatMap((changed) =>
              changed === 0
                ? Effect.fail(new NotFound({ resource: "post", id }))
                : Effect.void,
            ),
          ),
      }),
    ),
  );
}
