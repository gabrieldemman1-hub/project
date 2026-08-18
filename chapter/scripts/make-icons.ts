/**
 * Generates the PWA icons as real PNGs, with no image dependency.
 *
 * The mark is a bookmark: an amber field with a cream bookmark notched at the
 * bottom. It reads at 40px on a home screen, which is the only size that
 * actually matters.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { LIGHT } from '../src/styles/tokens.ts'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../public')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size: number, pixels: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0 // filter: none
    Buffer.from(pixels.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, rowStart + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ])
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** True when a normalised point falls inside the bookmark glyph. */
function inGlyph(nx: number, ny: number, scale: number): boolean {
  // Work in glyph space, scaled about the centre.
  const x = (nx - 0.5) / scale + 0.5
  const y = (ny - 0.5) / scale + 0.5
  const left = 0.355
  const right = 0.645
  const top = 0.215
  const bottom = 0.785
  if (x < left || x > right || y < top || y > bottom) return false
  // Notch: a triangle cut up from the bottom edge.
  const notchTop = 0.605
  if (y >= notchTop) {
    const t = (y - notchTop) / (bottom - notchTop)
    if (Math.abs(x - 0.5) <= (right - left) * 0.5 * t) return false
  }
  return true
}

function render(size: number, scale: number): Uint8Array {
  const [br, bg, bb] = hexToRgb(LIGHT.accent)
  const [fr, fg, fb] = hexToRgb(LIGHT.ground)
  const px = new Uint8Array(size * size * 4)
  const SS = 3 // supersample, so the notch edge isn't a staircase
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size
          const ny = (y + (sy + 0.5) / SS) / size
          if (inGlyph(nx, ny, scale)) hits++
        }
      }
      const a = hits / (SS * SS)
      const i = (y * size + x) * 4
      px[i] = Math.round(br + (fr - br) * a)
      px[i + 1] = Math.round(bg + (fg - bg) * a)
      px[i + 2] = Math.round(bb + (fb - bb) * a)
      px[i + 3] = 255
    }
  }
  return px
}

mkdirSync(outDir, { recursive: true })

const targets: Array<{ file: string; size: number; scale: number }> = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
  // Maskable icons get cropped to a circle by Android, so the glyph shrinks
  // into the inner safe zone.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.66 },
]

for (const t of targets) {
  const png = encodePng(t.size, render(t.size, t.scale))
  writeFileSync(resolve(outDir, t.file), png)
  console.log(`${t.file}  ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)}kb`)
}
