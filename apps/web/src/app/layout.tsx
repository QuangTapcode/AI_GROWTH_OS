import type { Metadata } from "next";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Growth OS — Growth Management & Autonomous Workflows",
  description: "AI Growth OS — Next-gen autonomous AI operations for growth, SEO, and content.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
