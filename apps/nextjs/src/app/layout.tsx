import { cn } from "@gmacko/ui";
import { ThemeProvider, ThemeToggle } from "@gmacko/ui/theme";
import { Toaster } from "@gmacko/ui/toast";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";
import { Providers } from "./providers";

import "~/app/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: "Gmacko App",
  description:
    "A SaaS-first template with public launch controls, workspace onboarding, and optional product layers.",
  openGraph: {
    title: "Gmacko App",
    description:
      "A SaaS-first template with public launch controls, workspace onboarding, and optional product layers.",
    url: env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    siteName: "Gmacko App",
  },
  twitter: {
    card: "summary_large_image",
    site: "@jullerino",
    creator: "@jullerino",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <Providers>
            <TRPCReactProvider>{props.children}</TRPCReactProvider>
          </Providers>
          <div className="absolute right-4 bottom-4">
            <ThemeToggle />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
