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
  title: "JADAMO OCEAN ATLAS | 우리들의 바다 여행 기록",
  description:
    "바다를 따라, 우리의 여행은 계속된다. 함께 떠난 섬과 바다의 순간을 한곳에 모은 JADAMO 여행 아틀라스.",
  metadataBase: new URL("https://jadamo-trip.eomkun12.chatgpt.site"),
  openGraph: {
    type: "website",
    siteName: "JADAMO OCEAN ATLAS",
    title: "JADAMO OCEAN ATLAS",
    description: "바다를 따라, 우리의 여행은 계속된다.",
    url: "/",
    locale: "ko_KR",
    images: [
      {
        url: "/og.png",
        width: 1734,
        height: 907,
        alt: "청록빛 바다와 섬들로 그려진 JADAMO OCEAN ATLAS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JADAMO OCEAN ATLAS",
    description: "바다를 따라, 우리의 여행은 계속된다.",
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
