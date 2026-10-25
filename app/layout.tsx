import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Spell Kitchen — A little room for wild ideas", description: "Describe, tinker, and cast. A playable isometric spell workshop." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
