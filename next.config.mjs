/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', 'exceljs', 'xlsx', 'jszip'],
};

export default nextConfig;
