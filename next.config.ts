import type { NextConfig } from "next";
import path from "path";

// Standalone is required for the Electron desktop bundle only.
// Enabling it on Vercel breaks the NFT tracing step (missing next-server.js.nft.json).
const useStandalone = process.env.AGENTPILOTS_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(useStandalone ? { output: "standalone" as const } : {}),
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.openai.com" },
      { protocol: "https", hostname: "**.higgsfield.ai" },
    ],
  },
};

export default nextConfig;
