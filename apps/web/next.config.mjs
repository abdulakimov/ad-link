/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the shared canonical package. NOTE: never add @adlink/db here —
  // the frontend must stay out of the database (DESIGN/CLAUDE rule).
  transpilePackages: ['@adlink/core'],
  // Type errors still fail the build; a unified ESLint config lands in a later phase.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
