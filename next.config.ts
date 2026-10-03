import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" }, {
      protocol: "https",
      hostname: "firebasestorage.googleapis.com",
      pathname: "/v0/b/comparacel.firebasestorage.app/o/**",
    }],
  },
};

export default nextConfig;
