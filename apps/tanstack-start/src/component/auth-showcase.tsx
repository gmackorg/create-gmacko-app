import { Button } from "@gmacko/ui/button";
import { useNavigate } from "@tanstack/react-router";

import { authClient } from "~/auth/client";

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

export function AuthShowcase() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4">
        <SocialSignInButton provider="github" label="Sign in with GitHub" />
        <SocialSignInButton provider="google" label="Sign in with Google" />
        <SocialSignInButton provider="apple" label="Sign in with Apple" />
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
