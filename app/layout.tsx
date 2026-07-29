import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NoticeCenter from "./notice-center";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JADAMO OCEAN ATLAS | 우리들의 바다 여행 기록",
  description: "바다를 따라, 우리의 여행은 계속됩니다. JADAMO 크루의 다이빙 여행 아카이브.",
  metadataBase: new URL("https://jadamo-trip.eomkun12.chatgpt.site"),
  openGraph: {
    type: "website",
    siteName: "JADAMO OCEAN ATLAS",
    title: "JADAMO OCEAN ATLAS",
    description: "바다를 따라, 우리의 여행은 계속됩니다.",
    url: "/",
    locale: "ko_KR",
    images: [{ url: "/og.png", width: 1734, height: 907, alt: "푸른 바다 위에 기록된 JADAMO OCEAN ATLAS" }],
  },
  twitter: { card: "summary_large_image", title: "JADAMO OCEAN ATLAS", description: "바다를 따라, 우리의 여행은 계속됩니다.", images: ["/og.png"] },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "JADAMO OCEAN", statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}<NoticeCenter /></body></html>;
}
