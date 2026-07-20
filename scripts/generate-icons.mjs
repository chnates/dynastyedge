// Generates all app icons from the Crown Crest mark (see CLAUDE.md → Logo).
// Run after any logo change:  node scripts/generate-icons.mjs
//
// Outputs (public/): apple-touch-icon.png (180, full-bleed — iOS masks its
// own corners), favicon-32x32.png, favicon-16x16.png, favicon.ico, logo.svg.
// The in-app drawer lockup lives in src/components/shared/DynastyEdgeLogo.jsx
// and shares this geometry.

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Primetime Blackout: brand-red ground, silver crown (the two sanctioned
// gradient families — see docs/design/phase3-design-brief.md).
const GRADIENT = `
  <linearGradient id="g" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#C8102E"/>
    <stop offset="1" stop-color="#7E0E22"/>
  </linearGradient>
  <linearGradient id="crown" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#E9EBED"/>
    <stop offset="1" stop-color="#C9CDD1"/>
  </linearGradient>`

// Crown Crest: three ascending bars (rising chart) as crown prongs, a jewel
// dot floating above each tip, and a detached base band (the circlet).
// Geometry spans x 20–76, y 13–76 in a 96×96 viewBox.
const CROWN = (fill) => `
  <g fill="${fill}">
    <circle cx="28" cy="39" r="4.5"/>
    <circle cx="48" cy="27" r="4.5"/>
    <circle cx="68" cy="15" r="4.5"/>
    <rect x="22" y="48" width="12" height="12" rx="5"/>
    <rect x="42" y="36" width="12" height="24" rx="5"/>
    <rect x="62" y="24" width="12" height="36" rx="5"/>
    <rect x="20" y="66" width="56" height="10" rx="5"/>
  </g>`

// App icon: full-bleed red gradient, silver crown, no border, no pre-rounding.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs>${GRADIENT}</defs>
  <rect width="96" height="96" fill="url(#g)"/>
  ${CROWN('url(#crown)')}
</svg>`

// Favicon / browser tab: rounded gradient square so it looks right
// in square favicon slots.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs>${GRADIENT}</defs>
  <rect width="96" height="96" rx="22" fill="url(#g)"/>
  ${CROWN('url(#crown)')}
</svg>`

async function png(svg, size) {
  return sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer()
}

const appleTouch = await png(iconSvg, 180)
const fav32 = await png(faviconSvg, 32)
const fav16 = await png(faviconSvg, 16)

await writeFile(path.join(PUBLIC, 'apple-touch-icon.png'), appleTouch)
await writeFile(path.join(PUBLIC, 'icon-192.png'), await png(iconSvg, 192))
await writeFile(path.join(PUBLIC, 'icon-512.png'), await png(iconSvg, 512))
await writeFile(path.join(PUBLIC, 'favicon-32x32.png'), fav32)
await writeFile(path.join(PUBLIC, 'favicon-16x16.png'), fav16)
await writeFile(path.join(PUBLIC, 'favicon.ico'), await pngToIco([fav32, fav16]))
await writeFile(path.join(PUBLIC, 'logo.svg'), faviconSvg + '\n')

console.log('Icons regenerated in public/')
