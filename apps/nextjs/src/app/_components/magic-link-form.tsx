"use client";

import { Button } from "@gmacko/ui/button";
import { Input } from "@gmacko/ui/input";
import { useState } from "react";
import { authClient } from "~/auth/client";

export function MagicLinkForm({
  bypassMagicLink,
}: {
  bypassMagicLink: boolean;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setLoading(true);

    await authClient.signIn.magicLink({ email, callbackURL: "/" });

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="w-full text-center">
        <p className="text-muted-foreground text-sm">
          {bypassMagicLink
            ? "Magic link sent. Check the emulate Resend inbox or server console."
            : "Check your email for a magic link to sign in."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <Input
        type="email"
        placeholder="email@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "Signing in..." : "Continue with Email"}
      </Button>
    </form>
  );
}
