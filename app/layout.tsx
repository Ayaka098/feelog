import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "feelog",
  description: "感情の備忘録",
  icons: {
    icon: [{ url: "/ロゴ_ファビコン用.png", type: "image/png" }],
    apple: [{ url: "/ロゴ_ファビコン用.png", type: "image/png" }],
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
