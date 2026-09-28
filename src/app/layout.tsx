import type { Metadata, Viewport } from "next";
import PwaInstall from "@/components/PwaInstall";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "JNV Teacher Routine Portal", template: "%s | JNV Teacher Routine Portal" },
  description: "Jawahar Navodaya Vidyalaya, Rymbai - Teacher Routine Portal",
  robots: { index: false, follow: false },
  applicationName: "JNV Portal",
  appleWebApp: { capable: true, title: "JNV Portal", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a3aa8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}
