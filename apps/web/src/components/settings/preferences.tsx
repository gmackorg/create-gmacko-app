import type { Theme } from "@gmacko/domain";
import { Button } from "@gmacko/ui/button";
import { Label } from "@gmacko/ui/label";
import { SettingsCard } from "@gmacko/ui/settings-card";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";

import { useApiErrorHandler } from "~/components/use-api-error";
import { mutations, queries } from "~/lib/api";

const themes: ReadonlyArray<Theme> = ["light", "dark", "system"];

/**
 * Theme and notification switches. `getPreferences` answers defaults with
 * `id: null` until the first write; that is a normal state, not an error.
 */
export function PreferencesSection() {
  const { data: preferences } = useSuspenseQuery(
    queries.settings.getPreferences(),
  );
  const onError = useApiErrorHandler();
  const update = useMutation({
    ...mutations.settings.updatePreferences(),
    onError: (error) => onError(error, "Could not save your preferences."),
  });

  return (
    <SettingsCard title="Preferences" data-testid="preferences">
      <div className="space-y-6">
        <div>
          <Label className="mb-2 block">Theme</Label>
          <div className="flex gap-2" role="group" aria-label="Theme">
            {themes.map((theme) => (
              <Button
                key={theme}
                variant={preferences.theme === theme ? "default" : "outline"}
                size="sm"
                aria-pressed={preferences.theme === theme}
                onClick={() => update.mutate({ theme })}
                disabled={update.isPending}
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
                name="emailNotifications"
                checked={preferences.emailNotifications}
                onChange={(event) =>
                  update.mutate({ emailNotifications: event.target.checked })
                }
                disabled={update.isPending}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>Email notifications</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="pushNotifications"
                checked={preferences.pushNotifications}
                onChange={(event) =>
                  update.mutate({ pushNotifications: event.target.checked })
                }
                disabled={update.isPending}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>Push notifications</span>
            </label>
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          {preferences.id === null
            ? "Using the defaults; your first change saves them."
            : `Saved${preferences.updatedAt ? ` ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(preferences.updatedAt)}` : ""}.`}
        </p>
      </div>
    </SettingsCard>
  );
}
