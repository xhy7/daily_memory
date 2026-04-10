/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  experimental: {
    serverActions: {
      bodyParser: {
        sizeLimit: '10mb',
      },
    },
  },
};

module.exports = nextConfig;
