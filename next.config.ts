import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['xlsx', 'pdfmake', 'pdf-parse'],
};

export default nextConfig;
