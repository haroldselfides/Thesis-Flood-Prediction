/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow loading GeoTIFF files from public/spatial
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

module.exports = nextConfig;
