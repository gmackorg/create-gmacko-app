"use client";

import type { ToasterProps } from "sonner";
import { Toaster as Sonner, toast } from "sonner";

import { useTheme } from "./theme";

/**
 * Sonner reads its toast colours from CSS custom properties. `CSSProperties`
 * (csstype) has no index signature for `--*`, so the style object is typed as
 * the intersection rather than asserted into shape.
 */
const toastVariables: React.CSSProperties & Record<`--${string}`, string> = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
};

export const Toaster = ({ ...props }: ToasterProps) => {
  const { themeMode } = useTheme();

  return (
    <Sonner
      theme={themeMode === "auto" ? "system" : themeMode}
      className="toaster group"
      style={toastVariables}
      {...props}
    />
  );
};

export { toast };
