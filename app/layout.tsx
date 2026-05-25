import type { Metadata } from "next";
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
