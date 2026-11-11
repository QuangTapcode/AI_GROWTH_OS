import type { Metadata } from "next";
import { metaRobots } from "@/lib/indexing";
import { siteUrl } from '@/lib/metadata';
import { LocaleDocument } from '@/features/site/locale-document';
import { Analytics } from '@/features/site/analytics';
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    title: {default:"TripC — Your next chapter in Da Nang",template:'%s — TripC'},
    description: "Practical guides for living, working and exploring in Da Nang.",
    metadataBase:siteUrl(),
    verification:process.env.GOOGLE_SITE_VERIFICATION?{google:process.env.GOOGLE_SITE_VERIFICATION}:undefined,
    robots: metaRobots(process.env),
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body><LocaleDocument/>{children}<Analytics/></body></html>;
}

