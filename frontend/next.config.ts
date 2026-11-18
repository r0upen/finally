import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Dev only: proxy /api to the FastAPI backend. Rewrites are not used by static export.
  ...(isDev && {
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${process.env.BACKEND_URL ?? "http://localhost:8000"}/api/:path*` }];
    },
  }),
};

export default nextConfig;
