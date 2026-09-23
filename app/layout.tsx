import type { Metadata, Viewport } from "next";
import { Bruno_Ace_SC, Inter } from "next/font/google";
import "./globals.css";

const brunoAceSC = Bruno_Ace_SC({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bruno-ace-sc",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Quiz-It",
  description: "Quiz-It by MAC Entertainment",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Quiz-It",
  },
  // iOS reads its home-screen icon from an apple-touch-icon link tag, not
  // from manifest.json (that's an Android/Chrome thing) - without this,
  // "Add to Home Screen" on an iPhone/iPad falls back to a screenshot of
  // whatever page was open as the icon instead of the actual Quiz-It logo.
  icons: {
    icon: "/me-logo.jpg",
    apple: "/me-logo.jpg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Without this, iOS Safari's env(safe-area-inset-*) variables report as 0
  // even on notched/home-indicator devices, since the page is telling the
  // browser it doesn't want to draw under those areas in the first place -
  // several screens (e.g. PairsPlayerBoard's bottom padding) rely on that
  // inset actually being non-zero to keep content clear of the home
  // indicator and, on a plain (not "Add to Home Screen") tab, Safari's own
  // browser chrome.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${brunoAceSC.variable} ${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
