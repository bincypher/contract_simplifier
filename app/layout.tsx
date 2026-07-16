import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Clarity | AI Document Analyzer", description: "Evidence-based document insights, without legal advice." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
