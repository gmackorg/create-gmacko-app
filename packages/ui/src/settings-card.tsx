import type * as React from "react";

import { cn } from "./index";

/** A titled settings section: heading, optional description and actions, then the body. */
export function SettingsCard({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className={cn("bg-card rounded-lg border p-6", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  );
}

/** A bordered sub-panel inside a settings card. */
export function SettingsPanel({
  title,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { title?: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border p-4", className)} {...props}>
      {title ? <h3 className="font-medium">{title}</h3> : null}
      {children}
    </div>
  );
}

/** Placeholder rows while a section's query is pending. */
export function SettingsSkeleton({
  title,
  rows = 2,
}: {
  title: React.ReactNode;
  rows?: number;
}) {
  return (
    <section className="bg-card rounded-lg border p-6" aria-busy="true">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="animate-pulse space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="bg-muted h-12 rounded" />
        ))}
      </div>
    </section>
  );
}
