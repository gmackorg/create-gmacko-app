import { appRouter, createTRPCContext } from "@gmacko/api";
import { Button } from "@gmacko/ui/button";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, getSession } from "~/auth/server";

export async function AuthShowcase() {
  const session = await getSession();

  if (!session) {
    return (
      <form>
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            const requestHeaders = new Headers(await headers());
            const caller = appRouter.createCaller(
              await createTRPCContext({
                headers: requestHeaders,
                authApi: auth.api,
              }),
            );
            const settingsCaller = caller.settings as {
              getLaunchState: () => Promise<{
                maintenanceMode: boolean;
                signupEnabled: boolean;
                canAutoCreateAccounts: boolean;
              }>;
            };
            const launchState = await settingsCaller.getLaunchState();

            if (launchState.maintenanceMode) {
              redirect("/?maintenance=1");
            }

            if (
              !launchState.signupEnabled &&
              !launchState.canAutoCreateAccounts
            ) {
              redirect("/?waitlist=1");
            }

            const res = await auth.api.signInSocial({
              body: {
                provider: "discord",
                callbackURL: "/",
              },
            });
            if (!res.url) {
              throw new Error("No URL returned from signInSocial");
            }
            redirect(res.url);
          }}
        >
          Sign in with Discord
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <p className="text-center text-2xl">
        <span>Logged in as {session.user.name}</span>
      </p>

      <form>
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            await auth.api.signOut({
              headers: await headers(),
            });
            redirect("/");
          }}
        >
          Sign out
        </Button>
      </form>
    </div>
  );
}
