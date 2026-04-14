/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  // Vercel serverless function limit is 4.5MB default, increase to max 10MB
  experimental: {
    serverActions: {
      bodyParser: {
        sizeLimit: '10mb',
      },
    },
  },
  // Increase images upload limit
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'public.blob.vercel-storage.com',
      },
    ],
  },
};

module.exports = nextConfig;
