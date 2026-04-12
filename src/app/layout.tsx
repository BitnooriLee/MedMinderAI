import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { I18nProvider } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MedMinder AI",
  description:
    "Medication adherence and safety support for elderly immigrants.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MedMinder",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn("min-h-dvh font-sans antialiased", inter.variable)}>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
