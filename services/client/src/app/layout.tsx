import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import AppClientProviders from "@/components/providers/AppClientProviders";
import SerwistClientProvider from "@/components/providers/SerwistClientProvider";
import { AppleSplashScreens } from "@/components/pwa/AppleSplashScreens";
import { color } from "@/lib/tokens";
import "./globals.css";

/**
 * The two families (design §3.2), each loaded once and exposed as a CSS
 * variable that Tailwind's `font-sans`/`font-display` read. Both are variable
 * fonts, so no weight list.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: color.bg,
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Cellar Assistant",
  description:
    "Manage your wine, beer, spirit, and coffee collections. Scan menus, track your cellar, and discover new favorites.",
  applicationName: "Cellar Assistant",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cellar Assistant",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Dark is static on <html> (D21): the tokens apply at first paint, not
    // after a client effect.
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        <AppleSplashScreens />
      </head>
      <body className="bg-background font-sans text-foreground">
        <SerwistClientProvider>
          <NuqsAdapter>
            <AppClientProviders>
              <div className="flex h-dvh w-screen pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
                {children}
              </div>
            </AppClientProviders>
          </NuqsAdapter>
          <Analytics />
          <SpeedInsights />
        </SerwistClientProvider>
      </body>
    </html>
  );
}
