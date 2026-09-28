import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    "tesseract.js",
    "@napi-rs/canvas",
    "pdfjs-dist",
    "sharp",
    "mammoth",
    "word-extractor",
    "jszip",
    "bcryptjs",
    "@prisma/client",
  ],
  // native / wasm files that are loaded at run time and would otherwise be missed by Vercel's bundle tracing
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/@napi-rs/canvas*/**/*",
      "./node_modules/pdfjs-dist/legacy/build/**/*",
      "./node_modules/.prisma/client/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
  },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, "@": path.join(process.cwd(), "src") };
    return config;
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
