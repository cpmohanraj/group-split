import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.GROUP_NAME || "Pickleball",
  description: "Who played, who paid, who owes.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
