import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "JNV Teacher Routine Portal",
    short_name: "JNV Portal",
    description: "Jawahar Navodaya Vidyalaya, Rymbai - routines, MOD duty, weekly off, notices and exams.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1c306b",
    theme_color: "#1a3aa8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My Dashboard", url: "/me" },
      { name: "MOD Duty", url: "/mod" },
      { name: "Notices", url: "/notices" },
      { name: "Exams", url: "/exams" },
    ],
  };
}
