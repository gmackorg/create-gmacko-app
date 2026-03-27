import { appRouter, createTRPCContext } from "@gmacko/api";
import { Button } from "@gmacko/ui/button";
import { Input } from "@gmacko/ui/input";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth, getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";
import {
  CreatePostForm,
  PostCardSkeleton,
  PostList,
} from "./_components/posts";

export default async function HomePage() {
  const session = await getSession();
  const requestHeaders = new Headers(await headers());
  const caller = appRouter.createCaller(
    await createTRPCContext({
      headers: requestHeaders,
      authApi: auth.api,
    }),
  );
  const bootstrapStatus = await caller.admin.bootstrapStatus();

  if (bootstrapStatus.requiresSetup) {
    async function completeBootstrap(formData: FormData) {
      "use server";

      const currentSession = await getSession();
      if (!currentSession?.user) {
        redirect("/");
      }

      const workspaceName = formData.get("workspaceName");
      if (
        typeof workspaceName !== "string" ||
        workspaceName.trim().length < 2
      ) {
        redirect("/?setupError=workspace-name");
      }

      const actionHeaders = new Headers(await headers());
      const actionCaller = appRouter.createCaller(
        await createTRPCContext({
          headers: actionHeaders,
          authApi: auth.api,
        }),
      );

      await actionCaller.admin.completeBootstrap({
        workspaceName: workspaceName.trim(),
      });

      redirect("/settings");
    }

    return (
      <main className="container mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-4 py-16">
        <section className="space-y-4">
          <p className="text-primary text-sm font-semibold uppercase tracking-[0.24em]">
            First-run setup
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Finish the initial app bootstrap
          </h1>
          <p className="text-muted-foreground max-w-2xl text-base sm:text-lg">
            This app has not been initialized yet. The first signed-in user will
            become the initial platform admin and own the first workspace.
          </p>
        </section>

        {session?.user ? (
          <section className="bg-card max-w-xl rounded-3xl border p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">
                Create your first workspace
              </h2>
              <p className="text-muted-foreground text-sm">
                Signed in as {session.user.email}. Pick the name you want to use
                for the first workspace and finish setup.
              </p>
            </div>

            <form action={completeBootstrap} className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Workspace name</span>
                <Input
                  name="workspaceName"
                  defaultValue={
                    session.user.name ? `${session.user.name}'s workspace` : ""
                  }
                  placeholder="Acme HQ"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>
              <Button type="submit">Complete setup</Button>
            </form>
          </section>
        ) : (
          <section className="bg-card max-w-3xl rounded-3xl border p-6 shadow-sm">
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold">
                Sign in to finish setup
              </h2>
              <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">
                Authenticate first, then return here to create the initial
                workspace and promote that account to platform admin.
              </p>
            </div>
            <div className="mt-6">
              <AuthShowcase />
            </div>
          </section>
        )}
      </main>
    );
  }

  prefetch(trpc.post.all.queryOptions());

  return (
    <HydrateClient>
      <main className="container h-screen py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Create <span className="text-primary">T3</span> Turbo
          </h1>
          <AuthShowcase />

          <CreatePostForm />
          <div className="w-full max-w-2xl overflow-y-scroll">
            <Suspense
              fallback={
                <div className="flex w-full flex-col gap-4">
                  <PostCardSkeleton />
                  <PostCardSkeleton />
                  <PostCardSkeleton />
                </div>
              }
            >
              <PostList />
            </Suspense>
          </div>
        </div>
      </main>
    </HydrateClient>
  );
}
