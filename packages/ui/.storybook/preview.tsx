import type { Preview } from "@storybook/react-vite";
import type { ReactNode } from "react";

import { ThemeProvider } from "../src/theme";
import { Toaster } from "../src/toast";

import "./styles.css";

function StorybookShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">{children}</div>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}

const preview: Preview = {
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
    (Story) => (
      <StorybookShell>
        <Story />
      </StorybookShell>
    ),
  ],
};

export default preview;
