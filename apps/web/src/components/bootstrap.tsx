import { CompleteBootstrap } from "@gmacko/domain";
import { Button } from "@gmacko/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@gmacko/ui/field";
import { Input } from "@gmacko/ui/input";
import { toast } from "@gmacko/ui/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { AuthShowcase } from "~/components/auth-showcase";
import { mutations } from "~/lib/api";
import { toastApiError } from "~/lib/errors";
import { useSession } from "~/lib/session";

const CompleteBootstrapForm = Schema.toStandardSchemaV1(CompleteBootstrap);

/**
 * The first-run screen: until `admin.bootstrapStatus.requiresSetup` is
 * false, the home page asks the first signed-in person to name the initial
 * workspace; completing it makes them the platform admin.
 */
export function BootstrapScreen() {
  const session = useSession();
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

      {session.user ? (
        <BootstrapForm
          email={session.user.email}
          defaultName={
            session.user.name ? `${session.user.name}'s workspace` : ""
          }
        />
      ) : (
        <section className="bg-card max-w-3xl rounded-3xl border p-6 shadow-sm">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Sign in to finish setup</h2>
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

function BootstrapForm(props: { email: string; defaultName: string }) {
  const navigate = useNavigate();
  const complete = useMutation({
    ...mutations.admin.completeBootstrap(),
    onSuccess: async () => {
      toast.success("Setup complete. You are the platform admin.");
      await navigate({ to: "/settings" });
    },
    onError: (error) => toastApiError(error, "Could not complete setup."),
  });
  const form = useForm({
    defaultValues: { workspaceName: props.defaultName },
    validators: { onSubmit: CompleteBootstrapForm },
    onSubmit: async ({ value }) => {
      await complete
        .mutateAsync({ workspaceName: value.workspaceName.trim() })
        .catch(() => undefined);
    },
  });

  return (
    <section className="bg-card max-w-xl rounded-3xl border p-6 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Create your first workspace</h2>
        <p className="text-muted-foreground text-sm">
          Signed in as {props.email}. Pick the name you want to use for the
          first workspace and finish setup.
        </p>
      </div>

      <form
        noValidate
        className="mt-6 space-y-4"
        data-testid="bootstrap-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="workspaceName"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Workspace name</FieldLabel>
                </FieldContent>
                <Input
                  id={field.name}
                  name={field.name}
                  placeholder="Acme HQ"
                  minLength={2}
                  maxLength={120}
                  required
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting || complete.isPending}>
              Complete setup
            </Button>
          )}
        />
      </form>
    </section>
  );
}
