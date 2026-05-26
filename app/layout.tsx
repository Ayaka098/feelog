import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

const zenMaruGothic = Zen_Maru_Gothic({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-zen-maru",
  weight: ["400", "500", "700"],
});

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
      <body className={`${zenMaruGothic.variable} min-h-full flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
