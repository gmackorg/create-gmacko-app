import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { mergeConfig } from "vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: (viteConfig) =>
    mergeConfig(viteConfig, {
      // The framework leaves the React/TSX transform to the app; without it
      // Storybook's post-transform plugins see raw TypeScript on Vite 8.
      plugins: [viteReact(), tailwindcss()],
    }),
};

export default config;
