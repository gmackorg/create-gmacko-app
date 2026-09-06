export type AnnouncementTone = "info" | "warning" | "critical";

const toneClasses: Record<AnnouncementTone, string> = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-950 dark:text-sky-100",
  warning:
    "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  critical: "border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100",
};

/** The public announcement / maintenance notice; renders nothing when there is neither. */
export function LaunchBanner(props: {
  announcementMessage: string | null;
  announcementTone: AnnouncementTone;
  maintenanceMode: boolean;
}) {
  if (!props.announcementMessage && !props.maintenanceMode) {
    return null;
  }
  return (
    <div
      role="status"
      data-testid="launch-banner"
      className={`rounded-2xl border px-4 py-3 text-sm ${
        toneClasses[props.announcementTone] ?? toneClasses.info
      }`}
    >
      <p className="font-semibold">
        {props.maintenanceMode ? "Maintenance mode" : "Announcement"}
      </p>
      {props.announcementMessage ? (
        <p className="mt-1">{props.announcementMessage}</p>
      ) : null}
    </div>
  );
}
