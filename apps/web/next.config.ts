import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@jobpulse/domain',
    '@jobpulse/ats',
    '@jobpulse/shared',
    '@jobpulse/url-resolution',
    '@jobpulse/validation',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
