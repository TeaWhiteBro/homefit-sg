import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "HomeFit SG · Singapore Rental Advisor",
  description:
    "Course prototype: explainable rental area recommendations across 44 Singapore areas and ten campus and workplace destinations, using clearly labelled demo data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
