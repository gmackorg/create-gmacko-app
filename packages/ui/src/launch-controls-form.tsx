"use client";

import { useState } from "react";

import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import type { AnnouncementTone } from "./launch-banner";
import { Select } from "./select";
import { Textarea } from "./textarea";

export interface LaunchControlsValues {
  readonly maintenanceMode: boolean;
  readonly signupEnabled: boolean;
  readonly announcementMessage: string | null;
  readonly announcementTone: AnnouncementTone;
  readonly allowedEmailDomains: ReadonlyArray<string>;
}

const tones: ReadonlyArray<AnnouncementTone> = ["info", "warning", "critical"];

const parseDomains = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);

/**
 * The admin's launch controls, edited locally and handed back whole on
 * submit. The parent owns the request; `submitting` disables the form
 * while it runs and `values` re-seeds the fields when the server answers.
 */
export function LaunchControlsForm(props: {
  values: LaunchControlsValues;
  onSubmit: (values: LaunchControlsValues) => void;
  submitting?: boolean | undefined;
}) {
  const [maintenanceMode, setMaintenanceMode] = useState(
    props.values.maintenanceMode,
  );
  const [signupEnabled, setSignupEnabled] = useState(
    props.values.signupEnabled,
  );
  const [announcementMessage, setAnnouncementMessage] = useState(
    props.values.announcementMessage ?? "",
  );
  const [announcementTone, setAnnouncementTone] = useState<AnnouncementTone>(
    props.values.announcementTone,
  );
  const [domains, setDomains] = useState(
    props.values.allowedEmailDomains.join(", "),
  );

  return (
    <form
      className="space-y-5"
      data-testid="launch-controls-form"
      onSubmit={(event) => {
        event.preventDefault();
        const message = announcementMessage.trim();
        props.onSubmit({
          maintenanceMode,
          signupEnabled,
          announcementMessage: message.length > 0 ? message : null,
          announcementTone,
          allowedEmailDomains: parseDomains(domains),
        });
      }}
    >
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="maintenanceMode"
            className="h-4 w-4 rounded border-gray-300"
            checked={maintenanceMode}
            onChange={(event) => setMaintenanceMode(event.target.checked)}
            disabled={props.submitting}
          />
          <span>Maintenance mode</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="signupEnabled"
            className="h-4 w-4 rounded border-gray-300"
            checked={signupEnabled}
            onChange={(event) => setSignupEnabled(event.target.checked)}
            disabled={props.submitting}
          />
          <span>Sign-up enabled</span>
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="announcementMessage">Announcement</Label>
        <Textarea
          id="announcementMessage"
          name="announcementMessage"
          rows={3}
          maxLength={2000}
          placeholder="Shown on the public landing page. Leave empty to hide it."
          value={announcementMessage}
          onChange={(event) => setAnnouncementMessage(event.target.value)}
          disabled={props.submitting}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="announcementTone">Tone</Label>
          <Select
            id="announcementTone"
            name="announcementTone"
            value={announcementTone}
            onChange={(event) => {
              // The `<option>`s below are exactly `tones`, so anything else
              // came from outside the form and is not a tone.
              const tone = tones.find(
                (candidate) => candidate === event.target.value,
              );
              if (tone !== undefined) setAnnouncementTone(tone);
            }}
            disabled={props.submitting}
            className="w-full"
          >
            {tones.map((tone) => (
              <option key={tone} value={tone}>
                {tone.charAt(0).toUpperCase() + tone.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="allowedEmailDomains">Allowed email domains</Label>
          <Input
            id="allowedEmailDomains"
            name="allowedEmailDomains"
            placeholder="example.com, partner.org"
            value={domains}
            onChange={(event) => setDomains(event.target.value)}
            disabled={props.submitting}
          />
        </div>
      </div>

      <Button type="submit" disabled={props.submitting}>
        {props.submitting ? "Saving..." : "Save launch controls"}
      </Button>
    </form>
  );
}
