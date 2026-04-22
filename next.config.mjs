/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output is needed for Railway; omit locally to avoid Windows symlink permission errors
  ...(process.env.STANDALONE === '1' ? { output: 'standalone' } : {}),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

export default nextConfig
