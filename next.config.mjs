import withPWA from "next-pwa";

const withPwa = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "7mb",
    },
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      "",
  },
};

export default withPwa(nextConfig);
