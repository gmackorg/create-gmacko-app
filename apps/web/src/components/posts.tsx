import { CreatePostForm as CreatePostSchema, type Post } from "@gmacko/domain";
import { cn } from "@gmacko/ui";
import { Button } from "@gmacko/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@gmacko/ui/field";
import { Input } from "@gmacko/ui/input";
import { useForm } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";

import { mutations, queries } from "~/lib/api";
import { toastApiError } from "~/lib/errors";

export function CreatePostForm() {
  const createPost = useMutation({
    ...mutations.posts.create(),
    onSuccess: () => form.reset(),
    onError: (error) => toastApiError(error, "Failed to create post"),
  });

  const form = useForm({
    defaultValues: {
      content: "",
      title: "",
    },
    validators: {
      onSubmit: CreatePostSchema,
    },
    // `mutateAsync` keeps the form submitting until the server answers, so
    // a second click while the first is in flight is ignored (the button is
    // disabled) rather than creating a duplicate.
    onSubmit: async ({ value }) => {
      await createPost.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="w-full max-w-2xl"
      data-testid="create-post-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field
          name="title"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Bug Title</FieldLabel>
                </FieldContent>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="Title"
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
        <form.Field
          name="content"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Content</FieldLabel>
                </FieldContent>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="Content"
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
      </FieldGroup>
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => (
          <Button
            type="submit"
            disabled={isSubmitting || createPost.isPending}
            data-testid="create-post"
          >
            Create
          </Button>
        )}
      />
    </form>
  );
}

export function PostList() {
  const { data: posts } = useSuspenseQuery(queries.posts.list());

  if (posts.length === 0) {
    return (
      <div
        className="relative flex w-full flex-col gap-4"
        data-testid="post-list"
      >
        <PostCardSkeleton pulse={false} />
        <PostCardSkeleton pulse={false} />
        <PostCardSkeleton pulse={false} />

        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10">
          <p className="text-2xl font-bold text-white">No posts yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4" data-testid="post-list">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}

export function PostCard(props: { post: Post }) {
  const deletePost = useMutation({
    ...mutations.posts.remove(),
    onError: (error) => toastApiError(error, "Failed to delete post"),
  });

  return (
    <div
      className="bg-muted flex flex-row rounded-lg p-4"
      data-testid="post-card"
    >
      <div className="grow">
        <h2 className="text-primary text-2xl font-bold">{props.post.title}</h2>
        <p className="mt-2 text-sm">{props.post.content}</p>
      </div>
      <div>
        <Button
          variant="ghost"
          className="text-primary cursor-pointer text-sm font-bold uppercase hover:bg-transparent hover:text-white"
          disabled={deletePost.isPending}
          onClick={() => deletePost.mutate(props.post.id)}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

export function PostCardSkeleton(props: { pulse?: boolean }) {
  const { pulse = true } = props;
  return (
    <div className="bg-muted flex flex-row rounded-lg p-4">
      <div className="grow">
        <h2
          className={cn(
            "bg-primary w-1/4 rounded-sm text-2xl font-bold",
            pulse && "animate-pulse",
          )}
        >
          &nbsp;
        </h2>
        <p
          className={cn(
            "mt-2 w-1/3 rounded-sm bg-current text-sm",
            pulse && "animate-pulse",
          )}
        >
          &nbsp;
        </p>
      </div>
    </div>
  );
}
