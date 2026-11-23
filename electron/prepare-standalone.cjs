const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const standaloneDir = path.join(root, '.next', 'standalone')

if (!fs.existsSync(standaloneDir)) {
  console.error('Standalone build not found. Run `pnpm build` first.')
  process.exit(1)
}

const staticSrc = path.join(root, '.next', 'static')
const staticDst = path.join(standaloneDir, '.next', 'static')
if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDst, { recursive: true, force: true })
}

const publicSrc = path.join(root, 'public')
const publicDst = path.join(standaloneDir, 'public')
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDst, { recursive: true, force: true })
}

console.log('Prepared self-contained Electron standalone bundle in .next/standalone')
