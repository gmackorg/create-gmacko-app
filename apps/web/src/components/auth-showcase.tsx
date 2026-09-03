import { MagicLinkRequestForm } from "@gmacko/domain";
import { Button } from "@gmacko/ui/button";
import { Field, FieldError } from "@gmacko/ui/field";
import { Input } from "@gmacko/ui/input";
import { toast } from "@gmacko/ui/toast";
import { useForm } from "@tanstack/react-form";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "~/auth/client";
import { queries } from "~/lib/api";
import { useSession } from "~/lib/session";
import { signOut } from "~/server/actions";

type Provider = "github" | "google" | "apple";

/**
 * GitHub and Google are generic OAuth providers server-side; since better-auth
 * 1.7 those are ordinary social providers, so `signIn.social` covers all three.
 * Before redirecting, the launch state decides whether sign-in is open at
 * all: maintenance sends people back with a notice, closed sign-up to the
 * waitlist (the same rule the Next.js version applied server-side).
 */
function SocialSignInButton({
  provider,
  label,
}: {
  provider: Provider;
  label: string;
}) {
  const navigate = useNavigate();
  const { data: launch } = useSuspenseQuery(queries.settings.launchState());
  const [busy, setBusy] = useState(false);

  return (
    <Button
      className="w-full"
      size="lg"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        if (launch.maintenanceMode) {
          await navigate({ to: "/", search: { maintenance: true } });
          return;
        }
        if (!launch.signupEnabled && !launch.canAutoCreateAccounts) {
          await navigate({ to: "/", search: { waitlist: true } });
          return;
        }
        setBusy(true);
        try {
          const res = await authClient.signIn.social({
            provider,
            callbackURL: "/",
          });
          if (res.error || !res.data?.url) {
            toast.error(res.error?.message ?? "Could not start sign-in");
            return;
          }
          window.location.assign(res.data.url);
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

function MagicLinkForm() {
  const [sent, setSent] = useState(false);
  const { data: launch } = useSuspenseQuery(queries.settings.launchState());
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: MagicLinkRequestForm },
    onSubmit: async ({ value }) => {
      const res = await authClient.signIn.magicLink({
        email: value.email.trim(),
        callbackURL: "/",
      });
      if (res.error) {
        toast.error(res.error.message ?? "Could not send the magic link");
        return;
      }
      setSent(true);
    },
  });

  if (sent) {
    return (
      <p
        className="text-muted-foreground w-full text-center text-sm"
        data-testid="magic-link-sent"
      >
        {launch.canAutoCreateAccounts
          ? "Magic link sent. Check your inbox, or the server log in development."
          : "Check your email for a magic link to sign in."}
      </p>
    );
  }

  return (
    <form
      noValidate
      className="flex w-full flex-col gap-3"
      data-testid="magic-link-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="email"
        children={(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <Field data-invalid={isInvalid}>
              <Input
                type="email"
                name={field.name}
                aria-label="Email"
                placeholder="email@example.com"
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
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Continue with Email"}
          </Button>
        )}
      />
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signOut();
          // The viewer changed: every cached answer is refetched as the
          // anonymous visitor (mounted screens follow the refetch; a cache
          // `clear()` would leave them holding the old data), then the
          // loaders re-run.
          await queryClient.invalidateQueries();
          await router.invalidate();
          await navigate({ to: "/", replace: true });
        } finally {
          setBusy(false);
        }
      }}
    >
      Sign out
    </Button>
  );
}

export function AuthShowcase() {
  const session = useSession();

  if (!session.user) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <SocialSignInButton provider="github" label="Sign in with GitHub" />
        <SocialSignInButton provider="google" label="Sign in with Google" />
        <SocialSignInButton provider="apple" label="Sign in with Apple" />

        <div className="flex w-full items-center gap-3 py-2">
          <div className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-sm">or</span>
          <div className="bg-border h-px flex-1" />
        </div>

        <MagicLinkForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <p className="text-center text-2xl" data-testid="signed-in-as">
        <span>Logged in as {session.user.name}</span>
      </p>
      <SignOutButton />
    </div>
  );
}
