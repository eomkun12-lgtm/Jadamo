import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JADAMO OCEAN Trip",
    short_name: "JADAMO",
    description: "우리들의 바다 여행 기록",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#142c8e",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
