import type { NextConfig } from "next";

/**
 * Next.js configuration.
 *
 * V9 Frontend: transpile the workspace packages so they get the
 * React 19 + bundler treatment; everything else is the standard
 * SSR/SSG setup. `reactStrictMode: true` is essential for
 * surfacing the effects/cleanup bugs that hide in real-time UIs.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@cortex/ui", "@cortex/api-client", "@cortex/config"],
  experimental: {
    typedRoutes: true,
  },
  // Pinned for the dark/light theme — the (marketing) route group
  // is statically generated, the (app) route group is dynamic.
  // The split is enforced by the route groups themselves.
  async headers() {
    return [
      {
        // V9 Part 3: security headers (also enforced at the
        // platform layer in src/platform/security/headers.py on
        // the backend). Belt + suspenders.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
