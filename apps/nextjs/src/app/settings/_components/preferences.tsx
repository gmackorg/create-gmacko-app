"use client";

import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@gmacko/ui/button";
import { Label } from "@gmacko/ui/label";

import { useTRPC } from "~/trpc/react";

export function PreferencesSection() {
  const [isPending, startTransition] = useTransition();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } =
    trpc.settings.getPreferences.useQuery();

  const updatePreferences = trpc.settings.updatePreferences.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.settings.getPreferences.queryKey(),
      });
    },
  });

  const handleThemeChange = (theme: "light" | "dark" | "system") => {
    startTransition(() => {
      updatePreferences.mutate({ theme });
    });
  };

  const handleNotificationToggle = (type: "email" | "push") => {
    if (!preferences) return;

    startTransition(() => {
      if (type === "email") {
        updatePreferences.mutate({
          emailNotifications: !preferences.emailNotifications,
        });
      } else {
        updatePreferences.mutate({
          pushNotifications: !preferences.pushNotifications,
        });
      }
    });
  };

  if (isLoading) {
    return (
      <section className="rounded-lg border p-6">
        <h2 className="mb-4 text-xl font-semibold">Preferences</h2>
        <div className="animate-pulse space-y-4">
          <div className="bg-muted h-10 rounded" />
          <div className="bg-muted h-10 rounded" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border p-6">
      <h2 className="mb-4 text-xl font-semibold">Preferences</h2>

      <div className="space-y-6">
        <div>
          <Label className="mb-2 block">Theme</Label>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((theme) => (
              <Button
                key={theme}
                variant={preferences?.theme === theme ? "default" : "outline"}
                size="sm"
                onClick={() => handleThemeChange(theme)}
                disabled={isPending}
              >
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Notifications</Label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preferences?.emailNotifications ?? true}
                onChange={() => handleNotificationToggle("email")}
                disabled={isPending}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>Email notifications</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preferences?.pushNotifications ?? true}
                onChange={() => handleNotificationToggle("push")}
                disabled={isPending}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>Push notifications</span>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
