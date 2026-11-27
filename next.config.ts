import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { staleTimes: { dynamic: 120 } },
  serverExternalPackages: ['tesseract.js', 'sharp', 'unpdf'],
  outputFileTracingIncludes: {
    '/api/capture/*': [
      './node_modules/tesseract.js/src/**/*',
      './node_modules/tesseract.js-core/*',
      './node_modules/@tesseract.js-data/eng/4.0.0_best_int/*',
    ],
  },
}

export default nextConfig
