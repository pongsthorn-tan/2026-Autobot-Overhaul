/** @type {import('next').NextConfig} */

// Generate build tag as dd/MMM/yyyy HH:mm in GMT+7 (Bangkok)
function generateBuildTag() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date(Date.now() + 7 * 3600_000);
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const mmm = months[now.getUTCMonth()];
  const yyyy = now.getUTCFullYear();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mmm}/${yyyy} ${hh}:${mm}`;
}

const nextConfig = {
  distDir: '.next',
  output: 'standalone',
  env: {
    NEXT_PUBLIC_BUILD_TAG: process.env.NEXT_PUBLIC_BUILD_TAG || generateBuildTag(),
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:7600/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
