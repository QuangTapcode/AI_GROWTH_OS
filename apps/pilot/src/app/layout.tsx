import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TripC — Da Nang pilot",
  description: "English website pilot for TripC.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

