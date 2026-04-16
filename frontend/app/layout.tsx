import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Deep Research",
  description: "AI-powered local research system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
