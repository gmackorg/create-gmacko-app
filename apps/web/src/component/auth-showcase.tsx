import { Button } from "@gmacko/ui/button";
import { Input } from "@gmacko/ui/input";
import { toast } from "@gmacko/ui/toast";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "~/auth/client";

/**
 * GitHub and Google are generic OAuth providers server-side; since better-auth
 * 1.7 those are ordinary social providers, so `signIn.social` covers all three.
 */
function SocialSignInButton({
  provider,
  label,
}: {
  provider: "github" | "google" | "apple";
  label: string;
}) {
  const navigate = useNavigate();

  return (
    <Button
      className="w-full"
      size="lg"
      variant="outline"
      onClick={async () => {
        const res = await authClient.signIn.social({
          provider,
          callbackURL: "/",
        });
        if (!res.data?.url) {
          throw new Error("No URL returned from signInSocial");
        }
        await navigate({ href: res.data.url, replace: true });
      }}
    >
      {label}
    </Button>
  );
}

function MagicLinkForm() {
  const [email, setEmail] = useState("");
  return (
    <form
      className="flex w-full gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const res = await authClient.signIn.magicLink({
          email,
          callbackURL: "/",
        });
        if (res.error) {
          toast.error(res.error.message ?? "Could not send the magic link");
          return;
        }
        toast.success("Magic link sent; check your inbox (or the server log)");
      }}
    >
      <Input
        type="email"
        name="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" variant="outline">
        Email me a link
      </Button>
    </form>
  );
}

export function AuthShowcase() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  if (!session) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <SocialSignInButton provider="github" label="Sign in with GitHub" />
        <SocialSignInButton provider="google" label="Sign in with Google" />
        <SocialSignInButton provider="apple" label="Sign in with Apple" />
        <MagicLinkForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <p className="text-center text-2xl">
        <span>Logged in as {session.user.name}</span>
      </p>

      <Button
        size="lg"
        onClick={async () => {
          await authClient.signOut();
          await navigate({ href: "/", replace: true });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
