import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(dirname),
  },
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  enablePrerenderSourceMaps: false,
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:40704',
  },
}

export default nextConfig
