import type { Metadata, Viewport } from "next";
import { Bruno_Ace_SC } from "next/font/google";
import "./globals.css";

const brunoAceSC = Bruno_Ace_SC({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bruno-ace-sc",
});

export const metadata: Metadata = {
  title: "Quiz-It",
  description: "Quiz-It by MAC Entertainment",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${brunoAceSC.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-black">{children}</body>
    </html>
  );
}
