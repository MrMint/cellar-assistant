import "@fontsource/inter";
import { Box } from "@mui/joy";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import NhostClientProvider from "@/components/providers/NhostClientProvider";
import SerwistClientProvider from "@/components/providers/SerwistClientProvider";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#111015",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
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
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SerwistClientProvider>
          <NuqsAdapter>
            <NhostClientProvider>
              <Box
                sx={{
                  display: "flex",
                  height: "100vh",
                  width: "100vw",
                }}
              >
                {children}
              </Box>
            </NhostClientProvider>
          </NuqsAdapter>
          <Analytics />
          <SpeedInsights />
        </SerwistClientProvider>
      </body>
    </html>
  );
}
