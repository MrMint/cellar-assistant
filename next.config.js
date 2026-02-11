/** @type {import('next').NextConfig} */
const nextConfig = {
  // React Strict Mode disabled to prevent development-mode double-renders that cause flashing
  // This was causing visual flashing issues during zoom/pan operations in development
  // React Strict Mode is enabled by default in Next.js 15 development mode
  reactStrictMode: false,
  // Allow larger body sizes for server actions (file uploads)
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  async headers() {
    const headers = [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self)",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.nhost.run wss://*.nhost.run https://*.googleapis.com https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://d2ad6b4ur7yvpq.cloudfront.net https://va.vercel-scripts.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];

    return headers;
  },
};

module.exports = nextConfig;
