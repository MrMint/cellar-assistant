import "@fontsource/inter";
import { Box } from "@mui/joy";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NhostClientProvider from "@/components/providers/NhostClientProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cellar Assistant",
  description: "Cool marketing slogan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
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
        <Analytics />
      </body>
    </html>
  );
}
