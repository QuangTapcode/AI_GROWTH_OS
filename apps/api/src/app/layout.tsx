import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Growth OS — API staging",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body style={{ fontFamily: "system-ui, sans-serif", margin: "40px", lineHeight: 1.6 }}>{children}</body></html>;
}

