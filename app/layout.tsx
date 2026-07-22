import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NoticeCenter from "./notice-center";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JADAMO OCEAN Trip — Trip Atlas",
  description: "지도 위에서 함께 계획하고 기록하는 JADAMO의 여행 아틀라스.",
  metadataBase: new URL("https://ishigaki-escape-2026.eomkun12.chatgpt.site"),
  openGraph: {
    title: "JADAMO OCEAN Trip",
    description: "지도 위에서 함께 계획하고 기록하는 JADAMO의 여행 아틀라스.",
    images: [{ url: "/og.png", width: 1734, height: 907 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "JADAMO OCEAN Trip",
    description: "지도 위에서 함께 계획하고 기록하는 JADAMO의 여행 아틀라스.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <NoticeCenter />
      </body>
    </html>
  );
}
