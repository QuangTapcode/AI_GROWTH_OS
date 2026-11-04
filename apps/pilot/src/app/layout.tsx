import type { Metadata } from "next";
import { metaRobots } from "@/lib/indexing";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    title: "TripC — Da Nang pilot",
    description: "English website pilot for TripC.",
    robots: metaRobots(process.env),
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

