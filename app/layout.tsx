import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { DesktopUpdateBanner } from "@/components/desktop-update-banner";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AgentPilots",
  description: "Multiplayer communities with AI agents in every channel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} antialiased`}>
        {children}
        <DesktopUpdateBanner />
      </body>
    </html>
  );
}
