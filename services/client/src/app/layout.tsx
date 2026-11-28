import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SkipLink } from "@/components/app/SkipLink";
import AppClientProviders from "@/components/providers/AppClientProviders";
import { FeedbackProvider } from "@/components/providers/FeedbackProvider";
import SerwistClientProvider from "@/components/providers/SerwistClientProvider";
import { AppleSplashScreens } from "@/components/pwa/AppleSplashScreens";
import {
  readThemeChoice,
  THEME_COLOR,
  THEME_SCRIPT,
  themeHtmlProps,
} from "@/lib/theme";
import "./globals.css";
// B05 route motion; after globals.css, and its own file (L26).
import "./view-transitions.css";

/**
 * Inter only (KIT § 1 Type), loaded once and exposed as a CSS variable that
 * Tailwind's `font-sans` (and the `font-display` alias, L26) read. A variable
 * font, so no weight list.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
/**
 * The browser chrome follows the theme: one colour for Dark or Light, the
 * OS's for Phone. The pre-paint script rewrites them when the choice changes.
 */
export async function generateViewport(): Promise<Viewport> {
  const choice = readThemeChoice(await cookies());
  return {
    themeColor:
      choice === "phone"
        ? [
            {
              media: "(prefers-color-scheme: light)",
              color: THEME_COLOR.light,
            },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
          ]
        : THEME_COLOR[choice],
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
    viewportFit: "cover",
  };
}

export const metadata: Metadata = {
  // X21: every route names itself ("Cellars · Cellar Assistant"), through its
  // own `metadata` or `generateMetadata`; `lib/dev-checks/page-titles.test.ts`
  // holds every page.tsx to that. A page sets its own words only — never the
  // suffix — or `{ absolute }` when the app's name is already in them.
  title: { default: "Cellar Assistant", template: "%s · Cellar Assistant" },
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const choice = readThemeChoice(await cookies());
  return (
    // The choice comes from the `theme` cookie (L9); THEME_SCRIPT sets
    // data-theme from it before first paint (Phone resolves the OS's scheme;
    // the precached offline page follows the cookie, L45). The server never
    // renders data-theme: React would patch it back on every router.refresh()
    // (CA-1). The script adds it before hydration, hence
    // suppressHydrationWarning.
    <html
      lang="en"
      {...themeHtmlProps(choice)}
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant built from our own tokens, no input.
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        <AppleSplashScreens />
      </head>
      <body className="bg-background font-sans text-foreground">
        {/* X21: the first Tab stop on every page; each frame's <main> is its target. */}
        <SkipLink />
        <SerwistClientProvider>
          <NuqsAdapter>
            <AppClientProviders>
              <FeedbackProvider>
                <div className="flex h-dvh w-screen pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
                  {children}
                </div>
              </FeedbackProvider>
            </AppClientProviders>
          </NuqsAdapter>
          <Analytics />
          <SpeedInsights />
        </SerwistClientProvider>
      </body>
    </html>
  );
}
