const nextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: [
    "@short-drama/domain",
    "@short-drama/storage",
    "@short-drama/model-adapters",
    "@short-drama/pipeline",
  ],
};

export default nextConfig;
