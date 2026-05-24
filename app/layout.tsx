import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "feelog",
  description: "感情の備忘録",
  icons: {
    icon: [{ url: "/feelog-logo-favicon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/feelog-logo-favicon.png", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
