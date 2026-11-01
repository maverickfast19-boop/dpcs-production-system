import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DPCS | Dies Production Control System",
  description: "Sistem kendali produksi dies untuk satu pabrik.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}