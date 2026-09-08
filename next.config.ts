import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The 1inch SDKs ship a broken ESM build (extensionless relative imports).
  // Opting them out of bundling makes Next resolve them with native `require`,
  // which picks the working CJS build. Server-only code — never import the
  // Aqua lib into a Client Component.
  serverExternalPackages: [
    "@1inch/aqua-sdk",
    "@1inch/swap-vm-sdk",
    "@1inch/sdk-core",
    "@1inch/byte-utils",
  ],
};

export default nextConfig;
