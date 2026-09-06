import type * as React from "react";

import { cn } from "./index";

/** A native `<select>` styled like `Input`. */
export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input bg-background text-foreground focus-visible:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
