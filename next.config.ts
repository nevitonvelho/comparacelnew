import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/admin/products/*/price": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  async redirects() {
    return [
      { source: "/compare/:slug", destination: "/comparar/:slug", permanent: true },
      { source: "/compare", destination: "/comparar", permanent: true },
      { source: "/comparacoes", destination: "/comunidade", permanent: true },
      { source: "/busca", destination: "/catalogo", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.comparacel.com.br" }], destination: `${new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://comparacel.com.br").origin}/:path*`, permanent: true },
    ];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" }, {
      protocol: "https",
      hostname: "firebasestorage.googleapis.com",
      pathname: "/v0/b/comparacel.firebasestorage.app/o/**",
    }],
  },
};

export default nextConfig;
