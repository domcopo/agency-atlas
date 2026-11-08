import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content Security Policy: tells the browser what this site may load and talk to.
// The most important line is connect-src 'self' — the page can only send data
// back to this app, never to any other website.
// Known limitation: Next.js needs 'unsafe-inline' scripts unless we use per-request
// nonces. The browser never talks to Supabase, GoHighLevel or the AI directly
// (all of that happens on the server), so connect-src stays 'self'.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`, // dev only: live-reload connection
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'none'", // no service worker = nothing private cached offline
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Private tool: ask search engines never to list any page.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Once hosted: browsers must always use HTTPS for this site (2 years).
  ...(process.env.VERCEL === "1" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Quick add photos are shrunk on the phone first (to ~1600px); 2 MB leaves room.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
