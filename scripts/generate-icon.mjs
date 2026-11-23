import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const electronDir = path.resolve(dirname, '..', 'electron')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0098ff"/>
      <stop offset="100%" stop-color="#005a9e"/>
    </linearGradient>
  </defs>
  <rect x="12" y="12" width="232" height="232" rx="48" fill="url(#bg)"/>
  <rect x="12" y="12" width="232" height="232" rx="48" fill="none" stroke="#4fc1ff" stroke-opacity="0.35" stroke-width="4"/>
  <text x="128" y="156" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="112" font-weight="800" fill="#ffffff" letter-spacing="-4">VZ</text>
  <circle cx="204" cy="56" r="14" fill="#4ec9b0"/>
</svg>`

const pngBuffer = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer()
await writeFile(path.join(electronDir, 'icon.png'), pngBuffer)

// Wrap 256x256 PNG inside a valid single-entry Windows ICO container
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(1, 4) // count: 1

const entry = Buffer.alloc(16)
entry.writeUInt8(0, 0) // width 0 = 256
entry.writeUInt8(0, 1) // height 0 = 256
entry.writeUInt8(0, 2) // color count
entry.writeUInt8(0, 3) // reserved
entry.writeUInt16LE(1, 4) // planes
entry.writeUInt16LE(32, 6) // bit count
entry.writeUInt32LE(pngBuffer.length, 8) // bytes in res
entry.writeUInt32LE(22, 12) // image offset (6 + 16)

const icoBuffer = Buffer.concat([header, entry, pngBuffer])
await writeFile(path.join(electronDir, 'icon.ico'), icoBuffer)
console.log('Generated electron/icon.png and electron/icon.ico')
