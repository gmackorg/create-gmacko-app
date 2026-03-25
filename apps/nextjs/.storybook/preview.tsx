import { ThemeProvider } from "@gmacko/ui/theme";
import type { ReactNode } from "react";

import "../src/app/styles.css";

function StorybookShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">{children}</div>
      </div>
    </ThemeProvider>
  );
}

const preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story: () => ReactNode) => (
      <StorybookShell>
        <Story />
      </StorybookShell>
    ),
  ],
};

export default preview;
