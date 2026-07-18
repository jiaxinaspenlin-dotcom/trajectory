/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Proxy /api/* to the FastAPI backend so the browser never needs the key,
    // and to avoid CORS in local dev.
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    return [{ source: "/backend/:path*", destination: `${base}/:path*` }];
  },
};
export default nextConfig;
