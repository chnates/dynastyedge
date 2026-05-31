import sharp from 'sharp'
import fs from 'fs'

// Simplified dark-variant SVG used for all favicon sizes.
// Omits football icon and DYNASTYEDGE text — they'd be invisible at small sizes.
const svg = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="8" fill="#0B1120"/>
  <rect x="1.5" y="1.5" width="97" height="97" rx="7" stroke="#1E3A5F" stroke-width="1.5" fill="none"/>
  <text x="9" y="17" font-family="sans-serif" font-size="10" font-weight="300" fill="#C8D8EA">01</text>
  <text x="50" y="64" font-family="sans-serif" font-size="46" font-weight="200" fill="#4A90D9" text-anchor="middle">De</text>
</svg>`

const buf = Buffer.from(svg)

async function run() {
  const [png32, png16, png180] = await Promise.all([
    sharp(buf).resize(32, 32).png().toBuffer(),
    sharp(buf).resize(16, 16).png().toBuffer(),
    sharp(buf).resize(180, 180).png().toBuffer(),
  ])

  fs.writeFileSync('public/favicon-32x32.png', png32)
  fs.writeFileSync('public/favicon-16x16.png', png16)
  fs.writeFileSync('public/apple-touch-icon.png', png180)
  fs.writeFileSync('public/favicon.ico', buildIco([
    { size: 32, data: png32 },
    { size: 16, data: png16 },
  ]))

  console.log('Favicons generated: favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png')
}

// Wraps PNG buffers in a minimal ICO container (PNG-embedded format).
function buildIco(images) {
  const count = images.length
  const headerSize = 6 + count * 16
  let offset = headerSize
  const entries = images.map(({ size, data }) => {
    const entry = { size, data, offset }
    offset += data.length
    return entry
  })

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)     // reserved
  header.writeUInt16LE(1, 2)     // type = icon
  header.writeUInt16LE(count, 4) // count

  const dirs = entries.map(({ size, data, offset }) => {
    const d = Buffer.alloc(16)
    d.writeUInt8(size >= 256 ? 0 : size, 0)  // width
    d.writeUInt8(size >= 256 ? 0 : size, 1)  // height
    d.writeUInt8(0, 2)    // color count
    d.writeUInt8(0, 3)    // reserved
    d.writeUInt16LE(1, 4) // planes
    d.writeUInt16LE(32, 6) // bit count
    d.writeUInt32LE(data.length, 8)  // bytes in resource
    d.writeUInt32LE(offset, 12)      // offset to data
    return d
  })

  return Buffer.concat([header, ...dirs, ...entries.map(e => e.data)])
}

run().catch(err => { console.error(err); process.exit(1) })
