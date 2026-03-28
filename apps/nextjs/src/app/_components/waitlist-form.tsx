import { appRouter, createTRPCContext } from "@gmacko/api";
import { Button } from "@gmacko/ui/button";
import { Input } from "@gmacko/ui/input";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, getSession } from "~/auth/server";

export async function WaitlistForm(props: {
  source: "landing" | "contact" | "referral" | "blocked-signup";
  redirectTo: string;
  title: string;
  description: string;
  buttonLabel: string;
}) {
  const session = await getSession();

  async function submitWaitlist(formData: FormData) {
    "use server";

    const email = formData.get("email");
    const message = formData.get("message");

    if (typeof email !== "string" || email.trim().length === 0) {
      redirect(`${props.redirectTo}?waitlistError=email`);
    }

    const requestHeaders = new Headers(await headers());
    const caller = appRouter.createCaller(
      await createTRPCContext({
        headers: requestHeaders,
        authApi: auth.api,
      }),
    );
    const settingsCaller = caller.settings as {
      submitWaitlistEntry: (input: {
        email: string;
        message?: string;
        referralCode?: string;
        source: "landing" | "contact" | "referral" | "blocked-signup";
      }) => Promise<unknown>;
    };

    await settingsCaller.submitWaitlistEntry({
      email: email.trim(),
      message:
        typeof message === "string" && message.trim().length > 0
          ? message.trim()
          : undefined,
      source: props.source,
    });

    redirect(`${props.redirectTo}?waitlist=1`);
  }

  return (
    <form
      action={submitWaitlist}
      className="border-border bg-card rounded-3xl border p-6 shadow-sm"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">{props.title}</h2>
        <p className="text-muted-foreground text-sm">{props.description}</p>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Email</span>
          <Input
            name="email"
            type="email"
            required
            defaultValue={session?.user.email ?? ""}
            placeholder="name@company.com"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Message</span>
          <textarea
            name="message"
            rows={4}
            placeholder="Tell us a bit about what you want to build."
            className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
          />
        </label>
        <Button type="submit">{props.buttonLabel}</Button>
      </div>
    </form>
  );
}
