import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "broker.lh",
    "*.trycloudflare.com",
  ],
  devIndicators: false,
  agentRules: false,
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      {
        source: "/pair-icons/:path*",
        destination: "https://binodex.app/img/coins/:path*",
      },
    ];
  },
};

export default nextConfig;
