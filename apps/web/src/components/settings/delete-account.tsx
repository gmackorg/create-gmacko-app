import { Button } from "@gmacko/ui/button";
import { SettingsCard } from "@gmacko/ui/settings-card";
import { toast } from "@gmacko/ui/toast";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { useApiErrorHandler } from "~/components/use-api-error";
import { mutations } from "~/lib/api";

/**
 * True account deletion through `settings.deleteAccount` (the auth user row
 * goes, and with it sessions, accounts, keys, preferences). The response
 * expires the session cookies; the mutation's meta clears the whole cache.
 */
export function DeleteAccountSection() {
  const router = useRouter();
  const navigate = useNavigate();
  const onError = useApiErrorHandler();
  const remove = useMutation({
    ...mutations.settings.deleteAccount(),
    onSuccess: async () => {
      toast.success("Your account has been deleted.");
      await router.invalidate();
      await navigate({ to: "/", replace: true });
    },
    onError: (error) => onError(error, "Could not delete your account."),
  });

  return (
    <SettingsCard
      title="Delete account"
      data-testid="delete-account"
      description="Permanently deletes your account, sessions, API keys and preferences. Workspaces you own are removed with it. This cannot be undone."
      className="border-destructive/40"
    >
      <Button
        variant="destructive"
        disabled={remove.isPending}
        onClick={() => {
          if (
            !window.confirm(
              "Delete your account? This removes everything tied to it and cannot be undone.",
            )
          ) {
            return;
          }
          remove.mutate();
        }}
      >
        Delete my account
      </Button>
    </SettingsCard>
  );
}
